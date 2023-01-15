// Vertical Workspaces
// GPL v3 ©G-dH@Github.com
// Credits - modified util module from https://github.com/RensAlthuis/vertical-overview
'use strict';

const Gi = imports._gi;
const Config = imports.misc.config;
const shellVersion = parseFloat(Config.PACKAGE_VERSION);

var Overrides = class {
    constructor() {
        this._overrides = {};
        this._injections = {};
    }

    addOverride(name, prototype, overrideList) {
        this._overrides[name] = {
            originals: this.overrideProto(prototype, overrideList),
            prototype,
        };
    }

    removeOverride(name) {
        const override = this._overrides[name];
        if (!override)
            return false;

        this.overrideProto(override.prototype, override.originals);
        this._overrides[name] = undefined;
        return true;
    }

    /*
    className.prototype
             .injections.funcName1
                        .funcName2
    */
    addInjection(className, prototype, injections) {
        if (!this._injections[className])
            this._injections[className] = {
                prototype,
                injections: {},
            };

        for (let name in injections) {
            this._injections[className].injections[name] = {
                original: this.injectToFunction(prototype, name, injections[name]),
            }
        }
    }

    removeInjection(className, funcName) {
        if (this._injections[className]) return false;
        const prototype = this._injections[className].prototype;

        const injection = this._injections[className].injections[funcName];
        if (!injection) return false;

        prototype[funcName] = injection.original;
        this._injections[funcName] = undefined;
        return true;
    }

    removeAll() {
        for (let name in this._overrides) {
            this.removeOverride(name);
            this._overrides[name] = undefined;
        }

        for (let className in this._injections) {
            const injt = this._injections[className];
            const prototype = injt.prototype;
            for (let funcName in injt.injections) {
                prototype[funcName] = injt.injections[funcName].original;
            }
            this._injections[className] = undefined;
        }
    }

    hookVfunc(proto, symbol, func) {
        proto[Gi.hook_up_vfunc_symbol](symbol, func);
    }

    overrideProto(proto, overrides) {
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
                        this.hookVfunc(proto, symbol.slice(6), overrides[symbol]);
                    } else {
                        this.hookVfunc(proto[Gi.gobject_prototype_symbol], symbol.slice(6), overrides[symbol]);
                    }
                }
                else {
                    proto[symbol] = overrides[symbol];
                }
            }
        }
        return backup;
    }

    injectToFunction(parent, name, func) {
        let origin = parent[name];
        parent[name] = function() {
            let ret;
            ret = origin.apply(this, arguments);
            func.apply(this, arguments);
            return ret;
        }

        return origin;
    }
}
