// Imported first in main.js: the fetch wrapper must be in place before any
// module fires its first request (session.js checks the login the moment
// it's imported) - otherwise that request bypasses offline mode.
import { installFetchProxy } from './fetchProxy'

installFetchProxy()
