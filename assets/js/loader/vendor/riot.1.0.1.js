/* Riot 1.0.1, @license MIT, (c) 2014 Muut Inc + contributors */
(function(e){"use strict";e.observable=function(e){var t={},n=[].slice;e.on=function(n,r){if(typeof r==="function"){n.replace(/[^\s]+/g,function(e,n){(t[e]=t[e]||[]).push(r);r.typed=n>0})}return e};e.off=function(n,r){if(n=="*")t={};else if(r){var o=t[n];for(var i=0,u;u=o&&o[i];++i){if(u===r)o.splice(i,1)}}else{n.replace(/[^\s]+/g,function(e){t[e]=[]})}return e};e.one=function(t,n){if(n)n.one=true;return e.on(t,n)};e.trigger=function(r){var o=n.call(arguments,1),i=t[r]||[];for(var u=0,f;f=i[u];++u){if(!f.busy){f.busy=true;f.apply(e,f.typed?[r].concat(o):o);if(f.one){i.splice(u,1);u--}f.busy=false}}return e};return e};var t={},n={"\\":"\\\\","\n":"\\n","\r":"\\r","'":"\\'"},r={"&":"&amp;",'"':"&quot;","<":"&lt;",">":"&gt;"};function o(e,t){return e==undefined?"":(e+"").replace(/[&\"<>]/g,function(e){return r[e]})}e.render=function(e,r,i){if(i===true)i=o;e=e||"";return(t[e]=t[e]||new Function("_","e","return '"+e.replace(/[\\\n\r']/g,function(e){return n[e]}).replace(/{\s*([\w\.]+)\s*}/g,"' + (e?e(_.$1,'$1'):_.$1||(_.$1==undefined?'':_.$1)) + '")+"'"))(r,i)};if(typeof top!="object")return;var i,u=e.observable({}),f=window.addEventListener,a=document;function c(e){e=e.type?location.hash:e;if(e!=i)u.trigger("pop",e);i=e}if(f){f("popstate",c,false);a.addEventListener("DOMContentLoaded",c,false)}else{a.attachEvent("onreadystatechange",function(){if(a.readyState==="complete")c("")})}e.route=function(e){if(typeof e==="function")return u.on("pop",e);if(history.pushState)history.pushState(0,0,e);c(e)}})(typeof top=="object"?window.riot={}:exports);