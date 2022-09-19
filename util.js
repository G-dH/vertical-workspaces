// Vertical Workspaces
// GPL v3 ©G-dH@Github.com
// Credits - modified util modul from https://github.com/RensAlthuis/vertical-overview
'use strict';

const Gi = imports._gi;
const Config = imports.misc.config;
const shellVersion = parseFloat(Config.PACKAGE_VERSION);

function hookVfunc(proto, symbol, func) {
    proto[Gi.hook_up_vfunc_symbol](symbol, func);
}

function overrideProto(proto, overrides) {
    const backup = {};

    for (let symbol in overrides) {
        if (symbol.startsWith('after_')) {
            const actualSymbol = symbol.slice('after_'.length);
            const fn = proto[actualSymbol];
            const afterFn = overrides[symbol]
            proto[actualSymbol] = function() {
                const args = Array.prototype.slice.call(arguments);
                const res = fn.apply(this, args);
                afterFn.apply(this, args);
                return res;
            };
            backup[actualSymbol] = fn;
        }
        else {
            backup[symbol] = proto[symbol];
            if (symbol.startsWith('vfunc')) {
                if (shellVersion < 42) {
                    hookVfunc(proto, symbol.slice(6), overrides[symbol]);
	            } else {
                    hookVfunc(proto[Gi.gobject_prototype_symbol], symbol.slice(6), overrides[symbol]);
                }
            }
            else {
                proto[symbol] = overrides[symbol];
            }
        }
    }
    return backup;
}

function injectToFunction(parent, name, func) {
    let origin = parent[name];
    parent[name] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        func.apply(this, arguments);
        return ret;
    }

    return origin;
}

function removeInjection(object, injection, name) {
    object[name] = injection[name];
}
