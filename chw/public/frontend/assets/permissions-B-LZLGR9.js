import{i as h}from"./index-D2wdkJxY.js";const a=new Map;function o(i,t,n=""){const s=`${i}:${t}:${n}`;return a.has(s)||a.set(s,h("frappe.client.has_permission",{doctype:i,docname:n,perm_type:t}).then(e=>!!(e!=null&&e.has_permission)).catch(()=>!1)),a.get(s)}export{o as h};
//# sourceMappingURL=permissions-B-LZLGR9.js.map
