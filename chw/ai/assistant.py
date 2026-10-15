"""AI assistant orchestration: calls an admin-configured OpenAI-compatible
chat completions endpoint, executes any tool calls it makes against Frappe
(always as the logged-in user - see tools.py), and returns a single final
reply per request. No streaming: the whole tool-call loop runs inside one
whitelisted call so the frontend only ever needs "send a message, get a
reply" - no server-side conversation state, no websocket/session plumbing.
"""

import json
import os
import re

import frappe
from frappe import _

from chw.ai.tools import TOOL_FUNCTIONS, TOOL_SCHEMAS

MAX_TOOL_ITERATIONS = 6
MAX_HISTORY_MESSAGES = 20
REQUEST_TIMEOUT_SECONDS = 30

GUIDE_PATH = os.path.join(os.path.dirname(__file__), 'ASSISTANT_GUIDE.md')
GUIDE_CACHE_SECONDS = 60

FALLBACK_GUIDE = """## Always do this
- Keep replies short and plain.
- Confirm before saving with create_record or update_record.
- Ask for missing required fields instead of guessing.
- If a tool call is denied for permission reasons, say so plainly and don't retry.

## Never do this
- Never invent data.
- Never bypass permissions.
- Never expose API keys or settings.
"""


def _load_guide():
    """Read ASSISTANT_GUIDE.md fresh (short cache to avoid a disk read on
    every message) so an admin editing it changes the assistant's behavior
    without a code change or redeploy. Falls back to a minimal built-in
    guide if the file is ever missing, so a bad edit/deploy can't take the
    assistant's guardrails down with it."""
    cached = frappe.cache().get_value('chw_ai_assistant_guide')
    if cached is not None:
        return cached
    try:
        with open(GUIDE_PATH, encoding='utf-8') as f:
            content = f.read()
        # Strip the editor-facing HTML comment block at the top (and any
        # others) - it's guidance for whoever edits the file, not useful
        # context for the model, so no reason to spend tokens on it.
        content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL).strip()
    except OSError:
        frappe.log_error('ASSISTANT_GUIDE.md not found, using fallback guide', 'AI Assistant guide missing')
        content = FALLBACK_GUIDE
    frappe.cache().set_value('chw_ai_assistant_guide', content, expires_in_sec=GUIDE_CACHE_SECONDS)
    return content


def _build_system_prompt(bot_name):
    identity = (
        f'You are {bot_name}, a voice/text assistant built into a community health worker app. '
        'Follow the guidance below exactly.'
    )
    return identity + '\n\n' + _load_guide()


def is_ai_assistant_enabled():
    return bool(frappe.get_single('App Setting').ai_assistant_enabled)


def _daily_message_cache_key(user):
    return f'ai_msg_count:{user}:{frappe.utils.today()}'


def _check_and_increment_rate_limit(settings):
    limit = frappe.utils.cint(settings.ai_daily_message_limit) or 50
    key = _daily_message_cache_key(frappe.session.user)
    count = frappe.cache().get_value(key) or 0
    if count >= limit:
        frappe.throw(
            _('You\'ve reached today\'s assistant usage limit. Please try again tomorrow.'),
            frappe.ValidationError,
        )
    frappe.cache().set_value(key, count + 1, expires_in_sec=60 * 60 * 30)


@frappe.whitelist()
def get_assistant_config():
    """Cheap, safe-for-every-user check: is the assistant on, and what's it
    called. Never includes the base URL, model, or key."""
    settings = frappe.get_single('App Setting')
    return {
        'enabled': bool(settings.ai_assistant_enabled),
        'bot_name': settings.ai_bot_name or 'Assistant',
    }


def _get_ai_credentials(settings):
    """The only place ai_api_key is ever decrypted. Never returned to a
    whitelisted caller, never logged."""
    api_key = settings.get_password('ai_api_key', raise_exception=False)
    return settings.ai_api_base_url, api_key, settings.ai_model


class AssistantConfigError(Exception):
    """Raised when the provider itself rejects the request for a reason an
    admin can fix in Settings (bad/missing key, unknown model, wrong base
    URL) - kept distinct from a transient network/provider outage so
    send_message can tell the user which kind of problem this is."""


class AssistantRateLimitedError(Exception):
    """Raised when the *provider* (not this app's own daily cap) throttles
    the request - most free tiers allow only a handful of requests per
    minute. Distinct from AssistantConfigError since this isn't something
    an admin needs to fix in Settings, just a "wait a bit" situation."""


def _call_chat_completions(base_url, api_key, model, messages, retry_on_429=True):
    import time

    import requests

    url = base_url.rstrip('/') + '/chat/completions'
    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    try:
        response = requests.post(
            url,
            headers=headers,
            json={
                'model': model,
                'messages': messages,
                'tools': TOOL_SCHEMAS,
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.exceptions.RequestException as e:
        raise AssistantConfigError(
            _('Could not reach the AI provider at the configured Base URL.')
        ) from e

    if response.status_code in (401, 403):
        raise AssistantConfigError(
            _('The AI provider rejected the request - the API Key is missing or incorrect.')
        )
    if response.status_code == 404:
        raise AssistantConfigError(
            _('The AI provider could not find that Model or Base URL - double-check both in Settings.')
        )
    if response.status_code == 429:
        # Free tiers commonly cap requests-per-minute rather than
        # requests-per-day - a short wait and a single retry clears most of
        # these without bothering the user at all.
        if retry_on_429:
            time.sleep(3)
            return _call_chat_completions(base_url, api_key, model, messages, retry_on_429=False)
        raise AssistantRateLimitedError(
            _('The AI provider is temporarily rate-limiting requests. Please wait a minute and try again.')
        )
    response.raise_for_status()
    return response.json()


def _execute_tool_call(tool_call):
    """Run one tool call. Returns (tool_result, navigate_action) - tool_result
    is what gets sent back to the model (a plain dict, {"error": ...} on
    failure instead of a fatal exception); navigate_action is only set for a
    successful navigate_to call, for the caller to surface to the frontend."""
    name = tool_call['function']['name']
    try:
        args = json.loads(tool_call['function'].get('arguments') or '{}')
    except (TypeError, ValueError):
        return {'error': 'Could not parse arguments for {0}'.format(name)}, None

    func = TOOL_FUNCTIONS.get(name)
    if not func:
        return {'error': 'Unknown tool: {0}'.format(name)}, None

    try:
        result = func(**args)
        if name == 'navigate_to':
            return {'ok': True}, result
        return result, None
    except (frappe.ValidationError, frappe.PermissionError, frappe.MandatoryError) as e:
        return {'error': str(e)}, None
    except Exception:
        frappe.log_error(frappe.get_traceback(), 'AI Assistant tool execution error')
        return {'error': 'Something went wrong completing that action.'}, None


@frappe.whitelist()
def send_message(messages, message):
    """messages: prior conversation as a JSON list of {role, content} dicts
    (frontend-owned, no server-side session). message: the new user text.
    Returns {reply, messages, action}."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    settings = frappe.get_single('App Setting')
    if not settings.ai_assistant_enabled:
        frappe.throw(_('The AI assistant is currently turned off.'), frappe.ValidationError)

    _check_and_increment_rate_limit(settings)

    base_url, api_key, model = _get_ai_credentials(settings)
    if not base_url or not model:
        frappe.throw(_('The AI assistant is not fully configured yet. Please contact an admin.'))

    if isinstance(messages, str):
        messages = json.loads(messages) if messages else []
    messages = list(messages or [])
    # Cap replayed history so cost/latency stay bounded regardless of how
    # long the conversation has run - keep only the most recent turns.
    if len(messages) > MAX_HISTORY_MESSAGES:
        messages = messages[-MAX_HISTORY_MESSAGES:]

    messages.append({'role': 'user', 'content': message})

    bot_name = settings.ai_bot_name or 'Assistant'
    system_prompt = _build_system_prompt(bot_name)
    api_messages = [{'role': 'system', 'content': system_prompt}] + messages

    action = None
    try:
        for _iteration in range(MAX_TOOL_ITERATIONS):
            data = _call_chat_completions(base_url, api_key, model, api_messages)
            choice = data['choices'][0]['message']
            tool_calls = choice.get('tool_calls')

            if not tool_calls:
                reply = choice.get('content') or ''
                messages.append({'role': 'assistant', 'content': reply})
                return {'reply': reply, 'messages': messages, 'action': action}

            api_messages.append(choice)
            for tool_call in tool_calls:
                result, maybe_action = _execute_tool_call(tool_call)
                if maybe_action:
                    action = maybe_action
                api_messages.append({
                    'role': 'tool',
                    'tool_call_id': tool_call.get('id'),
                    'content': json.dumps(result, default=str),
                })

        reply = _('I wasn\'t able to finish that - could you try rephrasing or breaking it into smaller steps?')
        messages.append({'role': 'assistant', 'content': reply})
        return {'reply': reply, 'messages': messages, 'action': action}

    except frappe.ValidationError:
        raise
    except AssistantConfigError as e:
        # Not a code bug - the provider itself rejected the request for a
        # reason an admin can fix (bad key, wrong model/URL). Surface the
        # specific reason so whoever's testing it in Settings isn't left
        # guessing from a generic "something went wrong".
        is_admin = bool({'Administrator', 'System Manager'} & set(frappe.get_roles()))
        reply = str(e) if is_admin else _(
            'The assistant isn\'t set up correctly yet. Please contact an admin.'
        )
        messages.append({'role': 'assistant', 'content': reply})
        return {'reply': reply, 'messages': messages, 'action': None}
    except AssistantRateLimitedError as e:
        # Also not a code bug - the provider's own (usually free-tier)
        # rate limit, not this app's daily cap. Same message for everyone,
        # since "wait a minute" applies regardless of role.
        reply = str(e)
        messages.append({'role': 'assistant', 'content': reply})
        return {'reply': reply, 'messages': messages, 'action': None}
    except Exception:
        frappe.log_error(frappe.get_traceback(), 'AI Assistant request failed')
        reply = _('Something went wrong reaching the assistant. Please try again in a moment.')
        messages.append({'role': 'assistant', 'content': reply})
        return {'reply': reply, 'messages': messages, 'action': None}
