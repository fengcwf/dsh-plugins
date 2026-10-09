//#region node_modules/@vue/shared/dist/shared.esm-bundler.js
// @__NO_SIDE_EFFECTS__
function e(e) {
	let t = /* @__PURE__ */ Object.create(null);
	for (let n of e.split(",")) t[n] = 1;
	return (e) => e in t;
}
var t = {}, n = [], r = () => {}, i = () => !1, a = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), o = (e) => e.startsWith("onUpdate:"), s = Object.assign, c = (e, t) => {
	let n = e.indexOf(t);
	n > -1 && e.splice(n, 1);
}, l = Object.prototype.hasOwnProperty, u = (e, t) => l.call(e, t), d = Array.isArray, f = (e) => x(e) === "[object Map]", p = (e) => x(e) === "[object Set]", m = (e) => x(e) === "[object Date]", h = (e) => typeof e == "function", g = (e) => typeof e == "string", _ = (e) => typeof e == "symbol", v = (e) => typeof e == "object" && !!e, y = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch), b = Object.prototype.toString, x = (e) => b.call(e), S = (e) => x(e).slice(8, -1), C = (e) => x(e) === "[object Object]", w = (e) => g(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, ee = /* @__PURE__ */ e(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), te = (e) => {
	let t = /* @__PURE__ */ Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, ne = /-\w/g, T = te((e) => e.replace(ne, (e) => e.slice(1).toUpperCase())), re = /\B([A-Z])/g, E = te((e) => e.replace(re, "-$1").toLowerCase()), ie = te((e) => e.charAt(0).toUpperCase() + e.slice(1)), ae = te((e) => e ? `on${ie(e)}` : ""), D = (e, t) => !Object.is(e, t), oe = (e, ...t) => {
	for (let n = 0; n < e.length; n++) e[n](...t);
}, O = (e, t, n, r = !1) => {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		writable: r,
		value: n
	});
}, se = (e) => {
	let t = parseFloat(e);
	return isNaN(t) ? e : t;
}, ce, le = () => ce ||= typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {};
function ue(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) {
			let r = e[n], i = g(r) ? me(r) : ue(r);
			if (i) for (let e in i) t[e] = i[e];
		}
		return t;
	}
	if (g(e) || v(e)) return e;
}
var de = /;(?![^(]*\))/g, fe = /:([^]+)/, pe = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function me(e) {
	let t = {};
	return e.replace(pe, (e) => e.startsWith("/*") ? "" : e).split(de).forEach((e) => {
		if (e) {
			let n = e.split(fe);
			n.length > 1 && (t[n[0].trim()] = n[1].trim());
		}
	}), t;
}
function k(e) {
	let t = "";
	if (g(e)) t = e;
	else if (d(e)) for (let n = 0; n < e.length; n++) {
		let r = k(e[n]);
		r && (t += r + " ");
	}
	else if (v(e)) for (let n in e) e[n] && (t += n + " ");
	return t.trim();
}
var he = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", ge = /* @__PURE__ */ e(he);
he + "";
function _e(e) {
	return !!e || e === "";
}
function ve(e, t, n) {
	if (e.length !== t.length) return !1;
	let r = !0;
	for (let i = 0; r && i < e.length; i++) r = Se(e[i], t[i], n);
	return r;
}
function ye(e, t, n) {
	if (e.size !== t.size) return !1;
	let r = Array.from(t), i = new Uint8Array(r.length);
	for (let t of e) {
		let e = -1;
		for (let a = 0; a < r.length; a++) if (!i[a] && Se(t, r[a], n)) {
			e = a;
			break;
		}
		if (e < 0) return !1;
		i[e] = 1;
	}
	return !0;
}
function be(e, t, n) {
	let r = f(e), i = f(t);
	if (r || i || (r = p(e), i = p(t), r || i)) return r && i ? ye(e, t, n) : !1;
	if (Object.keys(e).length !== Object.keys(t).length) return !1;
	for (let r in e) {
		let i = e.hasOwnProperty(r), a = t.hasOwnProperty(r);
		if (i && !a || !i && a || !Se(e[r], t[r], n)) return !1;
	}
	return String(e) === String(t);
}
function xe(e, t, n, r) {
	n ||= [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
	let [i, a] = n;
	if (i.has(e) || a.has(t)) return i.get(e) === t && a.get(t) === e;
	i.set(e, t), a.set(t, e);
	let o = r(e, t, n);
	return i.delete(e), a.delete(t), o;
}
function Se(e, t, n) {
	if (e === t) return !0;
	let r = m(e), i = m(t);
	return r || i ? r && i ? e.getTime() === t.getTime() : !1 : (r = _(e), i = _(t), r || i ? e === t : (r = d(e), i = d(t), r || i ? r && i ? xe(e, t, n, ve) : !1 : (r = v(e), i = v(t), r || i ? !r || !i ? !1 : xe(e, t, n, be) : String(e) === String(t))));
}
var Ce = (e) => !!(e && e.__v_isRef === !0), A = (e) => g(e) ? e : e == null ? "" : d(e) || v(e) && (e.toString === b || !h(e.toString)) ? Ce(e) ? A(e.value) : JSON.stringify(e, we, 2) : String(e), we = (e, t) => Ce(t) ? we(e, t.value) : f(t) ? { [`Map(${t.size})`]: [...t.entries()].reduce((e, [t, n], r) => (e[Te(t, r) + " =>"] = n, e), {}) } : p(t) ? { [`Set(${t.size})`]: [...t.values()].map((e) => Te(e)) } : _(t) ? Te(t) : v(t) && !d(t) && !C(t) ? String(t) : t, Te = (e, t = "") => _(e) ? `Symbol(${e.description ?? t})` : e, j, Ee = class {
	constructor(e = !1) {
		this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && j && (j.active ? (this.parent = j, this.index = (j.scopes || (j.scopes = [])).push(this) - 1) : (this._active = !1, this._warnOnRun = !1));
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = !0;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].pause();
			}
			for (e = 0, t = this.effects.length; e < t; e++) this.effects[e].pause();
		}
	}
	resume() {
		if (this._active && this._isPaused) {
			this._isPaused = !1;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].resume();
			}
			let n = this.effects.slice();
			for (e = 0, t = n.length; e < t; e++) n[e].resume();
		}
	}
	run(e) {
		if (this._active) {
			let t = j;
			try {
				return j = this, e();
			} finally {
				j = t;
			}
		}
	}
	on() {
		++this._on === 1 && (this.prevScope = j, j = this);
	}
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (j === this) j = this.prevScope;
			else {
				let e = j;
				for (; e;) {
					if (e.prevScope === this) {
						e.prevScope = this.prevScope;
						break;
					}
					e = e.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(e) {
		if (this._active) {
			this._active = !1;
			let t, n;
			for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].stop();
			for (this.effects.length = 0, t = 0, n = this.cleanups.length; t < n; t++) this.cleanups[t]();
			if (this.cleanups.length = 0, this.scopes) {
				let e = this.scopes.slice();
				for (t = 0, n = e.length; t < n; t++) e[t].stop(!0);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !e) {
				let e = this.parent.scopes.pop();
				e && e !== this && (this.parent.scopes[this.index] = e, e.index = this.index);
			}
			this.parent = void 0;
		}
	}
};
function De() {
	return j;
}
var M, Oe = /* @__PURE__ */ new WeakSet(), ke = class {
	constructor(e) {
		this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, j && (j.active ? j.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, Oe.has(this) && (Oe.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Ne(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, Ke(this), Ie(this);
		let e = M, t = He;
		M = this, He = !0;
		try {
			return this.fn();
		} finally {
			Le(this), M = e, He = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) Be(e);
			this.deps = this.depsTail = void 0, Ke(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? Oe.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		Re(this) && this.run();
	}
	get dirty() {
		return Re(this);
	}
}, Ae = 0, je, Me;
function Ne(e, t = !1) {
	if (e.flags |= 8, t) {
		e.next = Me, Me = e;
		return;
	}
	e.next = je, je = e;
}
function Pe() {
	Ae++;
}
function Fe() {
	if (--Ae > 0) return;
	if (Me) {
		let e = Me;
		for (Me = void 0; e;) {
			let t = e.next;
			e.next = void 0, e.flags &= -9, e = t;
		}
	}
	let e;
	for (; je;) {
		let t = je;
		for (je = void 0; t;) {
			let n = t.next;
			if (t.next = void 0, t.flags &= -9, t.flags & 1) try {
				t.trigger();
			} catch (t) {
				e ||= t;
			}
			t = n;
		}
	}
	if (e) throw e;
}
function Ie(e) {
	for (let t = e.deps; t; t = t.nextDep) t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function Le(e) {
	let t, n = e.depsTail, r = n;
	for (; r;) {
		let e = r.prevDep;
		r.version === -1 ? (r === n && (n = e), Be(r), Ve(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e;
	}
	e.deps = t, e.depsTail = n;
}
function Re(e) {
	for (let t = e.deps; t; t = t.nextDep) if (t.dep.version !== t.version || t.dep.computed && (ze(t.dep.computed) || t.dep.version !== t.version)) return !0;
	return !!e._dirty;
}
function ze(e) {
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === qe) || (e.globalVersion = qe, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Re(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = M, r = He;
	M = e, He = !0;
	try {
		Ie(e);
		let n = e.fn(e._value);
		(t.version === 0 || D(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		M = n, He = r, Le(e), e.flags &= -3;
	}
}
function Be(e, t = !1) {
	let { dep: n, prevSub: r, nextSub: i } = e;
	if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), n.subs === e && (n.subs = r, !r && n.computed)) {
		n.computed.flags &= -5;
		for (let e = n.computed.deps; e; e = e.nextDep) Be(e, !0);
	}
	!t && !--n.sc && n.map && n.map.delete(n.key);
}
function Ve(e) {
	let { prevDep: t, nextDep: n } = e;
	t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
var He = !0, Ue = [];
function We() {
	Ue.push(He), He = !1;
}
function Ge() {
	let e = Ue.pop();
	He = e === void 0 || e;
}
function Ke(e) {
	let { cleanup: t } = e;
	if (e.cleanup = void 0, t) {
		let e = M;
		M = void 0;
		try {
			t();
		} finally {
			M = e;
		}
	}
}
var qe = 0, Je = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, Ye = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
	}
	track(e) {
		if (!M || !He || M === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== M) t = this.activeLink = new Je(M, this), M.deps ? (t.prevDep = M.depsTail, M.depsTail.nextDep = t, M.depsTail = t) : M.deps = M.depsTail = t, Xe(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = M.depsTail, t.nextDep = void 0, M.depsTail.nextDep = t, M.depsTail = t, M.deps === t && (M.deps = e);
		}
		return t;
	}
	trigger(e) {
		this.version++, qe++, this.notify(e);
	}
	notify(e) {
		Pe();
		try {
			for (let e = this.subs; e; e = e.prevSub) e.sub.notify() && e.sub.dep.notify();
		} finally {
			Fe();
		}
	}
};
function Xe(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) Xe(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e;
	}
}
var Ze = /* @__PURE__ */ new WeakMap(), Qe = /* @__PURE__ */ Symbol(""), $e = /* @__PURE__ */ Symbol(""), et = /* @__PURE__ */ Symbol("");
function N(e, t, n) {
	if (He && M) {
		let t = Ze.get(e);
		t || Ze.set(e, t = /* @__PURE__ */ new Map());
		let r = t.get(n);
		r || (t.set(n, r = new Ye()), r.map = t, r.key = n), r.track();
	}
}
function tt(e, t, n, r, i, a) {
	let o = Ze.get(e);
	if (!o) {
		qe++;
		return;
	}
	let s = (e) => {
		e && e.trigger();
	};
	if (Pe(), t === "clear") o.forEach(s);
	else {
		let i = d(e), a = i && w(n);
		if (i && n === "length") {
			let e = Number(r);
			o.forEach((t, n) => {
				(n === "length" || n === et || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get(et)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(Qe)), f(e) && s(o.get($e)));
				break;
			case "delete":
				i || (s(o.get(Qe)), f(e) && s(o.get($e)));
				break;
			case "set": f(e) && s(o.get(Qe));
		}
	}
	Fe();
}
function nt(e) {
	let t = /* @__PURE__ */ I(e);
	return t === e || (N(t, "iterate", et), /* @__PURE__ */ F(e)) ? t : /* @__PURE__ */ zt(e) ? /* @__PURE__ */ Rt(e) ? t.map((e) => Ht(L(e))) : t.map(Ht) : t.map(L);
}
function rt(e) {
	return N(e = /* @__PURE__ */ I(e), "iterate", et), e;
}
function it(e, t) {
	return /* @__PURE__ */ zt(e) ? Ht(/* @__PURE__ */ Rt(e) ? L(t) : t) : L(t);
}
var at = {
	__proto__: null,
	[Symbol.iterator]() {
		return ot(this, Symbol.iterator, (e) => it(this, e));
	},
	concat(...e) {
		return nt(this).concat(...e.map((e) => d(e) ? nt(e) : e));
	},
	entries() {
		return ot(this, "entries", (e) => (e[1] = it(this, e[1]), e));
	},
	every(e, t) {
		return ct(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return ct(this, "filter", e, t, (e) => e.map((e) => it(this, e)), arguments);
	},
	find(e, t) {
		return ct(this, "find", e, t, (e) => it(this, e), arguments);
	},
	findIndex(e, t) {
		return ct(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return ct(this, "findLast", e, t, (e) => it(this, e), arguments);
	},
	findLastIndex(e, t) {
		return ct(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return ct(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return ut(this, "includes", e);
	},
	indexOf(...e) {
		return ut(this, "indexOf", e);
	},
	join(e) {
		return nt(this).join(e);
	},
	lastIndexOf(...e) {
		return ut(this, "lastIndexOf", e);
	},
	map(e, t) {
		return ct(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return dt(this, "pop");
	},
	push(...e) {
		return dt(this, "push", e);
	},
	reduce(e, ...t) {
		return lt(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return lt(this, "reduceRight", e, t);
	},
	shift() {
		return dt(this, "shift");
	},
	some(e, t) {
		return ct(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return dt(this, "splice", e);
	},
	toReversed() {
		return nt(this).toReversed();
	},
	toSorted(e) {
		return nt(this).toSorted(e);
	},
	toSpliced(...e) {
		return nt(this).toSpliced(...e);
	},
	unshift(...e) {
		return dt(this, "unshift", e);
	},
	values() {
		return ot(this, "values", (e) => it(this, e));
	}
};
function ot(e, t, n) {
	let r = rt(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ F(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var st = Array.prototype;
function ct(e, t, n, r, i, a) {
	let o = rt(e), s = o !== e && !/* @__PURE__ */ F(e), c = o[t];
	if (c !== st[t]) {
		let t = c.apply(e, a);
		return s ? L(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, it(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function lt(e, t, n, r) {
	let i = rt(e), a = i !== e && !/* @__PURE__ */ F(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = it(e, t)), n.call(this, t, it(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? it(e, c) : c;
}
function ut(e, t, n) {
	let r = /* @__PURE__ */ I(e);
	N(r, "iterate", et);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ Bt(n[0]) ? (n[0] = /* @__PURE__ */ I(n[0]), r[t](...n)) : i;
}
function dt(e, t, n = []) {
	We(), Pe();
	let r = (/* @__PURE__ */ I(e))[t].apply(e, n);
	return Fe(), Ge(), r;
}
var ft = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), pt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function mt(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ I(this);
	return N(t, "has", e), t.hasOwnProperty(e);
}
var ht = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? Nt : Mt : i ? jt : At).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = at[t])) return e;
			if (t === "hasOwnProperty") return mt;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ R(e) ? e : n);
		if ((_(t) ? pt.has(t) : ft(t)) || (r || N(e, "get", t), i)) return o;
		if (/* @__PURE__ */ R(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ It(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ It(o) : /* @__PURE__ */ P(o) : o;
	}
}, gt = class extends ht {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let e = /* @__PURE__ */ zt(i);
			if (!/* @__PURE__ */ F(n) && !/* @__PURE__ */ zt(n) && (i = /* @__PURE__ */ I(i), n = /* @__PURE__ */ I(n)), !a && /* @__PURE__ */ R(i) && !/* @__PURE__ */ R(n)) return e || (i.value = n), !0;
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ R(e) ? e : r);
		return e === /* @__PURE__ */ I(r) && s && (o ? D(n, i) && tt(e, "set", t, n, i) : tt(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && tt(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !pt.has(t)) && N(e, "has", t), n;
	}
	ownKeys(e) {
		return N(e, "iterate", d(e) ? "length" : Qe), Reflect.ownKeys(e);
	}
}, _t = class extends ht {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return !0;
	}
	deleteProperty(e, t) {
		return !0;
	}
}, vt = /* @__PURE__ */ new gt(), yt = /* @__PURE__ */ new _t(), bt = /* @__PURE__ */ new gt(!0), xt = (e) => e, St = (e) => Reflect.getPrototypeOf(e);
function Ct(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ I(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? xt : t ? Ht : L;
		return !t && N(a, "iterate", l ? $e : Qe), s(Object.create(u), { next() {
			let { value: e, done: t } = u.next();
			return t ? {
				value: e,
				done: t
			} : {
				value: c ? [d(e[0]), d(e[1])] : d(e),
				done: t
			};
		} });
	};
}
function wt(e) {
	return function(...t) {
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function Tt(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ I(r), a = /* @__PURE__ */ I(n);
			e || (D(n, a) && N(i, "get", n), N(i, "get", a));
			let { has: o } = St(i), s = t ? xt : e ? Ht : L;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && N(/* @__PURE__ */ I(t), "iterate", Qe), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ I(n), i = /* @__PURE__ */ I(t);
			return e || (D(t, i) && N(r, "has", t), N(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ I(a), s = t ? xt : e ? Ht : L;
			return !e && N(o, "iterate", Qe), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: wt("add"),
		set: wt("set"),
		delete: wt("delete"),
		clear: wt("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ I(this), r = St(n), i = /* @__PURE__ */ I(e), a = !t && !/* @__PURE__ */ F(e) && !/* @__PURE__ */ zt(e) ? i : e;
			return r.has.call(n, a) || D(e, a) && r.has.call(n, e) || D(i, a) && r.has.call(n, i) || (n.add(a), tt(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ F(n) && !/* @__PURE__ */ zt(n) && (n = /* @__PURE__ */ I(n));
			let r = /* @__PURE__ */ I(this), { has: i, get: a } = St(r), o = i.call(r, e);
			o ||= (e = /* @__PURE__ */ I(e), i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? D(n, s) && tt(r, "set", e, n, s) : tt(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ I(this), { has: n, get: r } = St(t), i = n.call(t, e);
			i ||= (e = /* @__PURE__ */ I(e), n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && tt(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ I(this), t = e.size !== 0, n = e.clear();
			return t && tt(e, "clear", void 0, void 0, void 0), n;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = Ct(r, e, t);
	}), n;
}
function Et(e, t) {
	let n = Tt(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var Dt = { get: /* @__PURE__ */ Et(!1, !1) }, Ot = { get: /* @__PURE__ */ Et(!1, !0) }, kt = { get: /* @__PURE__ */ Et(!0, !1) }, At = /* @__PURE__ */ new WeakMap(), jt = /* @__PURE__ */ new WeakMap(), Mt = /* @__PURE__ */ new WeakMap(), Nt = /* @__PURE__ */ new WeakMap();
function Pt(e) {
	switch (e) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
// @__NO_SIDE_EFFECTS__
function P(e) {
	return /* @__PURE__ */ zt(e) ? e : Lt(e, !1, vt, Dt, At);
}
// @__NO_SIDE_EFFECTS__
function Ft(e) {
	return Lt(e, !1, bt, Ot, jt);
}
// @__NO_SIDE_EFFECTS__
function It(e) {
	return Lt(e, !0, yt, kt, Mt);
}
function Lt(e, t, n, r, i) {
	if (!v(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = Pt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Rt(e) {
	return /* @__PURE__ */ zt(e) ? /* @__PURE__ */ Rt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function zt(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function F(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function Bt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ I(t) : e;
}
function Vt(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && O(e, "__v_skip", !0), e;
}
var L = (e) => v(e) ? /* @__PURE__ */ P(e) : e, Ht = (e) => v(e) ? /* @__PURE__ */ It(e) : e;
// @__NO_SIDE_EFFECTS__
function R(e) {
	return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function z(e) {
	return Ut(e, !1);
}
function Ut(e, t) {
	return /* @__PURE__ */ R(e) ? e : new Wt(e, t);
}
var Wt = class {
	constructor(e, t) {
		this.dep = new Ye(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : /* @__PURE__ */ I(e), this._value = t ? e : L(e), this.__v_isShallow = t;
	}
	get value() {
		return this.dep.track(), this._value;
	}
	set value(e) {
		let t = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ F(e) || /* @__PURE__ */ zt(e);
		e = n ? e : /* @__PURE__ */ I(e), D(e, t) && (this._rawValue = e, this._value = n ? e : L(e), this.dep.trigger());
	}
};
function B(e) {
	return /* @__PURE__ */ R(e) ? e.value : e;
}
var Gt = {
	get: (e, t, n) => t === "__v_raw" ? e : B(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ R(i) && !/* @__PURE__ */ R(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function Kt(e) {
	return /* @__PURE__ */ Rt(e) ? e : new Proxy(e, Gt);
}
var qt = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new Ye(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = qe - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && M !== this) return Ne(this, !0), !0;
	}
	get value() {
		let e = this.dep.track();
		return ze(this), e && (e.version = this.dep.version), this._value;
	}
	set value(e) {
		this.setter && this.setter(e);
	}
};
// @__NO_SIDE_EFFECTS__
function Jt(e, t, n = !1) {
	let r, i;
	return h(e) ? r = e : (r = e.get, i = e.set), new qt(r, i, n);
}
var Yt = {}, Xt = /* @__PURE__ */ new WeakMap(), Zt = void 0;
function Qt(e, t = !1, n = Zt) {
	if (n) {
		let t = Xt.get(n);
		t || Xt.set(n, t = []), t.push(e);
	}
}
function $t(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => o ? e : /* @__PURE__ */ F(e) || o === !1 || o === 0 ? en(e, 1) : en(e), m, g, _, v, y = !1, b = !1;
	if (/* @__PURE__ */ R(e) ? (g = () => e.value, y = /* @__PURE__ */ F(e)) : /* @__PURE__ */ Rt(e) ? (g = () => p(e), y = !0) : d(e) ? (b = !0, y = e.some((e) => /* @__PURE__ */ Rt(e) || /* @__PURE__ */ F(e)), g = () => e.map((e) => {
		if (/* @__PURE__ */ R(e)) return e.value;
		if (/* @__PURE__ */ Rt(e)) return p(e);
		if (h(e)) return f ? f(e, 2) : e();
	})) : g = h(e) ? n ? f ? () => f(e, 2) : e : () => {
		if (_) {
			We();
			try {
				_();
			} finally {
				Ge();
			}
		}
		let t = Zt;
		Zt = m;
		try {
			return f ? f(e, 3, [v]) : e(v);
		} finally {
			Zt = t;
		}
	} : r, n && o) {
		let e = g, t = o === !0 ? Infinity : o;
		g = () => en(e(), t);
	}
	let x = De(), S = () => {
		m.stop(), x && x.active && c(x.effects, m);
	};
	if (s && n) {
		let e = n;
		n = (...t) => {
			let n = e(...t);
			return S(), n;
		};
	}
	let C = b ? Array(e.length).fill(Yt) : Yt, w = (e) => {
		if (m.flags & 1 && (m.dirty || e)) {
			if (n) {
				let t = m.run();
				if (e || o || y || (b ? t.some((e, t) => D(e, C[t])) : D(t, C))) {
					_ && _();
					let e = Zt;
					Zt = m;
					try {
						let e = [
							t,
							C === Yt ? void 0 : b && C[0] === Yt ? [] : C,
							v
						];
						C = t, f ? f(n, 3, e) : n(...e);
					} finally {
						Zt = e;
					}
				}
			} else m.run();
		}
	};
	return u && u(w), m = new ke(g), m.scheduler = l ? () => l(w, !1) : w, v = (e) => Qt(e, !1, m), _ = m.onStop = () => {
		let e = Xt.get(m);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			Xt.delete(m);
		}
	}, n ? a ? w(!0) : C = m.run() : l ? l(w.bind(null, !0), !0) : m.run(), S.pause = m.pause.bind(m), S.resume = m.resume.bind(m), S.stop = S, S;
}
function en(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ R(e)) en(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) en(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		en(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) en(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && en(e[r], t, n);
	}
	return e;
}
//#endregion
//#region node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
function tn(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		rn(e, t, n);
	}
}
function nn(e, t, n, r) {
	if (h(e)) {
		let i = tn(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			rn(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(nn(e[a], t, n, r));
		return i;
	}
}
function rn(e, n, r, i = !0) {
	let a = n ? n.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: s } = n && n.appContext.config || t;
	if (n) {
		let t = n.parent, i = n.proxy, a = `https://vuejs.org/error-reference/#runtime-${r}`;
		for (; t;) {
			let n = t.ec;
			if (n) {
				for (let t = 0; t < n.length; t++) if (n[t](e, i, a) === !1) return;
			}
			t = t.parent;
		}
		if (o) {
			We(), tn(o, null, 10, [
				e,
				i,
				a
			]), Ge();
			return;
		}
	}
	an(e, r, a, i, s);
}
function an(e, t, n, r = !0, i = !1) {
	if (i) throw e;
	console.error(e);
}
var V = [], on = -1, sn = [], cn = null, ln = 0, un = /* @__PURE__ */ Promise.resolve(), dn = null;
function fn(e) {
	let t = dn || un;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function pn(e) {
	let t = on + 1, n = V.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = V[r], a = yn(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function mn(e) {
	if (!(e.flags & 1)) {
		let t = yn(e), n = V[V.length - 1];
		!n || !(e.flags & 2) && t >= yn(n) ? V.push(e) : V.splice(pn(t), 0, e), e.flags |= 1, hn();
	}
}
function hn() {
	dn ||= un.then(bn);
}
function gn(e) {
	if (!d(e)) cn && e.id === -1 ? cn.splice(ln + 1, 0, e) : e.flags & 1 || (sn.push(e), e.flags |= 1);
	else for (let t = 0; t < e.length; t++) sn.push(e[t]);
	hn();
}
function _n(e, t, n = on + 1) {
	for (; n < V.length; n++) {
		let t = V[n];
		if (t && t.flags & 2) {
			if (e && t.id !== e.uid) continue;
			V.splice(n, 1), n--, t.flags & 4 && (t.flags &= -2), t(), t.flags & 4 || (t.flags &= -2);
		}
	}
}
function vn(e) {
	if (sn.length) {
		let e = [...new Set(sn)].sort((e, t) => yn(e) - yn(t));
		if (sn.length = 0, cn) {
			for (let t = 0; t < e.length; t++) cn.push(e[t]);
			return;
		}
		for (cn = e, ln = 0; ln < cn.length; ln++) {
			let e = cn[ln];
			e.flags & 4 && (e.flags &= -2), e.flags & 8 || e(), e.flags &= -2;
		}
		cn = null, ln = 0;
	}
}
var yn = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function bn(e) {
	try {
		for (on = 0; on < V.length; on++) {
			let e = V[on];
			e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), tn(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2));
		}
	} finally {
		for (; on < V.length; on++) {
			let e = V[on];
			e && (e.flags &= -2);
		}
		on = -1, V.length = 0, vn(e), dn = null, (V.length || sn.length) && bn(e);
	}
}
var xn = null, Sn = null;
function Cn(e) {
	let t = xn;
	return xn = e, Sn = e && e.type.__scopeId || null, t;
}
function wn(e, t = xn, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && ki(-1);
		let i = Cn(t), a = Ei.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = Ei.length; e > a; e--) Di();
			Cn(i), r._d && ki(1);
		}
		return o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function Tn(e, n) {
	if (xn === null) return e;
	let r = aa(xn), i = e.dirs ||= [];
	for (let e = 0; e < n.length; e++) {
		let [a, o, s, c = t] = n[e];
		a && (h(a) && (a = {
			mounted: a,
			updated: a
		}), a.deep && en(o), i.push({
			dir: a,
			instance: r,
			value: o,
			oldValue: void 0,
			arg: s,
			modifiers: c
		}));
	}
	return e;
}
function En(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (We(), nn(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), Ge());
	}
}
function Dn(e, t) {
	if (Z) {
		let n = Z.provides, r = Z.parent && Z.parent.provides;
		r === n && (n = Z.provides = Object.create(r)), n[e] = t;
	}
}
function On(e, t, n = !1) {
	let r = Ki();
	if (r || Pr) {
		let i = Pr ? Pr._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
	}
}
var kn = /* @__PURE__ */ Symbol.for("v-scx"), An = () => On(kn);
function jn(e, t, n) {
	return Mn(e, t, n);
}
function Mn(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i, u = s({}, i), d = n && a || !n && c !== "post", f;
	if (Qi) {
		if (c === "sync") {
			let e = An();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = Z;
	u.call = (e, t, n) => nn(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		U(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : mn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = $t(e, n, u);
	return Qi && (f ? f.push(h) : d && h()), h;
}
function Nn(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? Pn(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Yi(this), s = Mn(i, a.bind(r), n);
	return o(), s;
}
function Pn(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var Fn = /* @__PURE__ */ Symbol("_vte"), In = (e) => e.__isTeleport, Ln = /* @__PURE__ */ Symbol("_leaveCb");
function Rn(e) {
	let t = e[0];
	if (e.length > 1) {
		for (let n of e) if (n.type !== wi) {
			t = n;
			break;
		}
	}
	return t;
}
function zn(e) {
	if (!qn(e)) return In(e.type) && e.children ? Rn(e.children) : e;
	if (e.component) return e.component.subTree;
	let { shapeFlag: t, children: n } = e;
	if (n) {
		if (t & 16) return n[0];
		if (t & 32 && h(n.default)) return n.default();
	}
}
function Bn(e, t) {
	if (e.shapeFlag & 6 && e.component) {
		e.transition = t;
		let n = e.component.subTree;
		Bn(In(n.type) && zn(n) || n, t);
	} else e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
function Vn(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
function Hn(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var Un = /* @__PURE__ */ new WeakMap();
function Wn(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => Wn(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Kn(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && Wn(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? aa(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e, m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ I(v), b = v === t ? i : (e) => !Hn(_, e) && u(y, e), x = (e, t) => !(t && Hn(_, t));
	if (m != null && m !== p) {
		if (Gn(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ R(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) tn(p, f, 12, [l, _]);
	else {
		let t = g(p), n = /* @__PURE__ */ R(p);
		if (t || n) {
			let i = () => {
				if (e.f) {
					let n = t ? b(p) ? v[p] : _[p] : x(p) || !e.k ? p.value : _[e.k];
					if (o) d(n) && c(n, s);
					else if (d(n)) n.includes(s) || n.push(s);
					else if (t) _[p] = [s], b(p) && (v[p] = _[p]);
					else {
						let t = [s];
						x(p, e.k) && (p.value = t), e.k && (_[e.k] = t);
					}
				} else t ? (_[p] = l, b(p) && (v[p] = l)) : n && (x(p, e.k) && (p.value = l), e.k && (_[e.k] = l));
			};
			if (l) {
				let t = () => {
					i(), Un.delete(e);
				};
				t.id = -1, Un.set(e, t), U(t, r);
			} else Gn(e), i();
		}
	}
}
function Gn(e) {
	let t = Un.get(e);
	t && (t.flags |= 8, Un.delete(e));
}
le().requestIdleCallback, le().cancelIdleCallback;
var Kn = (e) => !!e.type.__asyncLoader, qn = (e) => e.type.__isKeepAlive;
function Jn(e, t) {
	Xn(e, "a", t);
}
function Yn(e, t) {
	Xn(e, "da", t);
}
function Xn(e, t, n = Z) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (Qn(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) qn(e.parent.vnode) && Zn(r, t, n, e), e = e.parent;
	}
}
function Zn(e, t, n, r) {
	let i = Qn(t, e, r, !0);
	ar(() => {
		c(r[t], i);
	}, n);
}
function Qn(e, t, n = Z, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			We();
			let i = Yi(n), a = nn(t, n, e, r);
			return i(), Ge(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
}
var $n = (e) => (t, n = Z) => {
	(!Qi || e === "sp") && Qn(e, (...e) => t(...e), n);
}, er = $n("bm"), tr = $n("m"), nr = $n("bu"), rr = $n("u"), ir = $n("bum"), ar = $n("um"), or = $n("sp"), sr = $n("rtg"), cr = $n("rtc");
function lr(e, t = Z) {
	Qn("ec", e, t);
}
var ur = /* @__PURE__ */ Symbol.for("v-ndc");
function dr(e, t, n, r) {
	let i, a = n && n[r], o = d(e);
	if (o || g(e)) {
		let n = o && /* @__PURE__ */ Rt(e), r = !1, s = !1;
		n && (r = !/* @__PURE__ */ F(e), s = /* @__PURE__ */ zt(e), e = rt(e)), i = Array(e.length);
		for (let n = 0, o = e.length; n < o; n++) i[n] = t(r ? s ? Ht(L(e[n])) : L(e[n]) : e[n], n, void 0, a && a[n]);
	} else if (typeof e == "number") {
		i = Array(e);
		for (let n = 0; n < e; n++) i[n] = t(n + 1, n, void 0, a && a[n]);
	} else if (v(e)) {
		if (e[Symbol.iterator]) i = Array.from(e, (e, n) => t(e, n, void 0, a && a[n]));
		else {
			let n = Object.keys(e);
			i = Array(n.length);
			for (let r = 0, o = n.length; r < o; r++) {
				let o = n[r];
				i[r] = t(e[o], o, r, a && a[r]);
			}
		}
	} else i = [];
	return n && (n[r] = i), i;
}
var fr = (e) => e ? Zi(e) ? aa(e) : fr(e.parent) : null, pr = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => e.vnode.el,
	$data: (e) => e.data,
	$props: (e) => e.props,
	$attrs: (e) => e.attrs,
	$slots: (e) => e.slots,
	$refs: (e) => e.refs,
	$parent: (e) => fr(e.parent),
	$root: (e) => fr(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => Sr(e),
	$forceUpdate: (e) => e.f ||= () => {
		mn(e.update);
	},
	$nextTick: (e) => e.n ||= fn.bind(e.proxy),
	$watch: (e) => Nn.bind(e)
}), mr = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), hr = {
	get({ _: e }, n) {
		if (n === "__v_skip") return !0;
		let { ctx: r, setupState: i, data: a, props: o, accessCache: s, type: c, appContext: l } = e;
		if (n[0] !== "$") {
			let e = s[n];
			if (e !== void 0) switch (e) {
				case 1: return i[n];
				case 2: return a[n];
				case 4: return r[n];
				case 3: return o[n];
			}
			else if (mr(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else _r && (s[n] = 0);
		}
		let d = pr[n], f, p;
		if (d) return n === "$attrs" && N(e.attrs, "get", ""), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return mr(a, n) ? (a[n] = r, !0) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) || n[0] === "$" && n.slice(1) in e ? !1 : (o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || mr(n, c) || u(o, c) || u(i, c) || u(pr, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
function gr(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
var _r = !0;
function vr(e) {
	let t = Sr(e), n = e.proxy, i = e.ctx;
	_r = !1, t.beforeCreate && br(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: y, deactivated: b, beforeDestroy: x, beforeUnmount: S, destroyed: C, unmounted: w, render: ee, renderTracked: te, renderTriggered: ne, errorCaptured: T, serverPrefetch: re, expose: E, inheritAttrs: ie, components: ae, directives: D, filters: oe } = t;
	if (u && yr(u, i, null), s) for (let e in s) {
		let t = s[e];
		h(t) && (i[e] = t.bind(n));
	}
	if (a) {
		let t = a.call(n, n);
		v(t) && (e.data = /* @__PURE__ */ P(t));
	}
	if (_r = !0, o) for (let e in o) {
		let t = o[e], a = Q({
			get: h(t) ? t.bind(n, n) : h(t.get) ? t.get.bind(n, n) : r,
			set: !h(t) && h(t.set) ? t.set.bind(n) : r
		});
		Object.defineProperty(i, e, {
			enumerable: !0,
			configurable: !0,
			get: () => a.value,
			set: (e) => a.value = e
		});
	}
	if (c) for (let e in c) xr(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			Dn(t, e[t]);
		});
	}
	f && br(f, e, "c");
	function O(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (O(er, p), O(tr, m), O(nr, g), O(rr, _), O(Jn, y), O(Yn, b), O(lr, T), O(cr, te), O(sr, ne), O(ir, S), O(ar, w), O(or, re), d(E)) {
		if (E.length) {
			let t = e.exposed ||= {};
			E.forEach((e) => {
				Object.defineProperty(t, e, {
					get: () => n[e],
					set: (t) => n[e] = t,
					enumerable: !0
				});
			});
		} else e.exposed ||= {};
	}
	ee && e.render === r && (e.render = ee), ie != null && (e.inheritAttrs = ie), ae && (e.components = ae), D && (e.directives = D), re && Vn(e);
}
function yr(e, t, n = r) {
	d(e) && (e = Dr(e));
	for (let n in e) {
		let r = e[n], i;
		i = v(r) ? "default" in r ? On(r.from || n, r.default, !0) : On(r.from || n) : On(r), /* @__PURE__ */ R(i) ? Object.defineProperty(t, n, {
			enumerable: !0,
			configurable: !0,
			get: () => i.value,
			set: (e) => i.value = e
		}) : t[n] = i;
	}
}
function br(e, t, n) {
	nn(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function xr(e, t, n, r) {
	let i = r.includes(".") ? Pn(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) && jn(i, n);
	} else if (h(e)) jn(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => xr(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) && jn(i, r, e);
		}
	}
}
function Sr(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => Cr(c, e, o, !0)), Cr(c, t, o)), v(t) && a.set(t, c), c;
}
function Cr(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && Cr(e, a, n, !0), i && i.forEach((t) => Cr(e, t, n, !0));
	for (let i in t) if (!(r && i === "expose")) {
		let r = wr[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var wr = {
	data: Tr,
	props: kr,
	emits: kr,
	methods: Or,
	computed: Or,
	beforeCreate: H,
	created: H,
	beforeMount: H,
	mounted: H,
	beforeUpdate: H,
	updated: H,
	beforeDestroy: H,
	beforeUnmount: H,
	destroyed: H,
	unmounted: H,
	activated: H,
	deactivated: H,
	errorCaptured: H,
	serverPrefetch: H,
	components: Or,
	directives: Or,
	watch: Ar,
	provide: Tr,
	inject: Er
};
function Tr(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function Er(e, t) {
	return Or(Dr(e), Dr(t));
}
function Dr(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function H(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function Or(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function kr(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), gr(e), gr(t ?? {})) : t;
}
function Ar(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = H(e[r], t[r]);
	return n;
}
function jr() {
	return {
		app: null,
		config: {
			isNativeTag: i,
			performance: !1,
			globalProperties: {},
			optionMergeStrategies: {},
			errorHandler: void 0,
			warnHandler: void 0,
			compilerOptions: {}
		},
		mixins: [],
		components: {},
		directives: {},
		provides: /* @__PURE__ */ Object.create(null),
		optionsCache: /* @__PURE__ */ new WeakMap(),
		propsCache: /* @__PURE__ */ new WeakMap(),
		emitsCache: /* @__PURE__ */ new WeakMap()
	};
}
var Mr = 0;
function Nr(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (r = null);
		let i = jr(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: Mr++,
			_component: n,
			_props: r,
			_container: null,
			_context: i,
			_instance: null,
			version: sa,
			get config() {
				return i.config;
			},
			set config(e) {},
			use(e, ...t) {
				return a.has(e) || (e && h(e.install) ? (a.add(e), e.install(l, ...t)) : h(e) && (a.add(e), e(l, ...t))), l;
			},
			mixin(e) {
				return i.mixins.includes(e) || i.mixins.push(e), l;
			},
			component(e, t) {
				return t ? (i.components[e] = t, l) : i.components[e];
			},
			directive(e, t) {
				return t ? (i.directives[e] = t, l) : i.directives[e];
			},
			mount(a, o, s) {
				if (!c) {
					let u = l._ceVNode || Y(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, aa(u.component);
				}
			},
			onUnmount(e) {
				o.push(e);
			},
			unmount() {
				c && (nn(o, l._instance, 16), e(null, l._container), delete l._container.__vue_app__);
			},
			provide(e, t) {
				return i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = Pr;
				Pr = l;
				try {
					return e();
				} finally {
					Pr = t;
				}
			}
		};
		return l;
	};
}
var Pr = null, Fr = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${T(t)}Modifiers`] || e[`${E(t)}Modifiers`];
function Ir(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t, a = r, o = n.startsWith("update:"), s = o && Fr(i, n.slice(7));
	s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = a.map(se)));
	let c, l = i[c = ae(n)] || i[c = ae(T(n))];
	!l && o && (l = i[c = ae(E(n))]), l && nn(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, nn(u, e, 6, a);
	}
}
var Lr = /* @__PURE__ */ new WeakMap();
function Rr(e, t, n = !1) {
	let r = n ? Lr : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Rr(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function zr(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, E(t)) || u(e, t));
}
function Br(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [a], slots: s, attrs: c, emit: l, render: u, renderCache: d, props: f, data: p, setupState: m, ctx: h, inheritAttrs: g } = e, _ = Cn(e), v, y;
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = e;
			v = Ri(u.call(t, e, d, f, m, p, h)), y = c;
		} else {
			let e = t;
			v = Ri(e.length > 1 ? e(f, {
				attrs: c,
				slots: s,
				emit: l
			}) : e(f, null)), y = t.props ? c : Vr(c);
		}
	} catch (t) {
		Ei.length = 0, rn(t, e, 1), v = Y(wi);
	}
	let b = v;
	if (y && g !== !1) {
		let e = Object.keys(y), { shapeFlag: t } = b;
		e.length && t & 7 && (a && e.some(o) && (y = Hr(y, a)), b = Li(b, y, !1, !0));
	}
	return n.dirs && (b = Li(b, null, !1, !0), b.dirs = b.dirs ? b.dirs.concat(n.dirs) : n.dirs), n.transition && Bn(In(b.type) && zn(b) || b, n.transition), v = b, Cn(_), v;
}
var Vr = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, Hr = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
};
function Ur(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? Wr(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (Gr(o, r, n) && !zr(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || Wr(r, o, l) : !!o;
	return !1;
}
function Wr(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (Gr(t, e, a) && !zr(n, a)) return !0;
	}
	return !1;
}
function Gr(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !Se(r, i) : r !== i;
}
function Kr({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var qr = {}, Jr = () => Object.create(qr), Yr = (e) => Object.getPrototypeOf(e) === qr;
function Xr(e, t, n, r = !1) {
	let i = {}, a = Jr();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), Qr(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	e.props = n ? r ? i : /* @__PURE__ */ Ft(i) : e.type.props ? i : a, e.attrs = a;
}
function Zr(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ I(i), [c] = e.propsOptions, l = !1;
	if ((r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (zr(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = T(o);
						i[t] = $r(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		Qr(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = E(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = $r(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && tt(e.attrs, "set", "");
}
function Qr(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (ee(t)) continue;
		let l = n[t], d;
		a && u(a, d = T(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : zr(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ I(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = $r(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function $r(e, t, n, r, i, a) {
	let o = e[n];
	if (o != null) {
		let e = u(o, "default");
		if (e && r === void 0) {
			let e = o.default;
			if (o.type !== Function && !o.skipFactory && h(e)) {
				let { propsDefaults: a } = i;
				if (n in a) r = a[n];
				else {
					let o = Yi(i);
					r = a[n] = e.call(null, t), o();
				}
			} else r = e;
			i.ce && i.ce._setProp(n, r);
		}
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === E(n)) && (r = !0));
	}
	return r;
}
var ei = /* @__PURE__ */ new WeakMap();
function ti(e, r, i = !1) {
	let a = i ? ei : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = ti(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		let n = T(c[e]);
		ni(n) && (l[n] = t);
	}
	else if (c) for (let e in c) {
		let t = T(e);
		if (ni(t)) {
			let n = c[e], r = l[t] = d(n) || h(n) ? { type: n } : s({}, n), i = r.type, a = !1, o = !0;
			if (d(i)) for (let e = 0; e < i.length; ++e) {
				let t = i[e], n = h(t) && t.name;
				if (n === "Boolean") {
					a = !0;
					break;
				}
				n === "String" && (o = !1);
			}
			else a = h(i) && i.name === "Boolean";
			r[0] = a, r[1] = o, (a || u(r, "default")) && f.push(t);
		}
	}
	let m = [l, f];
	return v(e) && a.set(e, m), m;
}
function ni(e) {
	return e[0] !== "$" && !ee(e);
}
var ri = (e) => e === "_" || e === "_ctx" || e === "$stable", ii = (e) => d(e) ? e.map(Ri) : [Ri(e)], ai = (e, t, n) => {
	if (t._n) return t;
	let r = wn((...e) => ii(t(...e)), n);
	return r._c = !1, r;
}, oi = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (ri(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = ai(n, i, r);
		else if (i != null) {
			let e = ii(i);
			t[n] = () => e;
		}
	}
}, si = (e, t) => {
	let n = ii(t);
	e.slots.default = () => n;
}, ci = (e, t, n) => {
	for (let r in t) (n || !ri(r)) && (e[r] = t[r]);
}, li = (e, t, n) => {
	let r = e.slots = Jr();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (ci(r, t, n), n && O(r, "_", e, !0)) : oi(t, r);
	} else t && si(e, t);
}, ui = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let e = n._;
		e ? r && e === 1 ? o = !1 : ci(a, n, r) : (o = !n.$stable, oi(n, a)), s = n;
	} else n && (si(e, n), s = { default: 1 });
	if (o) for (let e in a) !ri(e) && s[e] == null && delete a[e];
}, U = Si;
function di(e) {
	return fi(e);
}
function fi(e, i) {
	let a = le();
	a.__VUE__ = !0;
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, r, i = null, a = null, o = null, s = void 0, c = null, l = !!t.dynamicChildren) => {
		if (e === t) return;
		e && !Mi(e, t) && (i = ye(e), k(e, a, o, !0), e = null), t.patchFlag === -2 && (l = !1, t.dynamicChildren = null), t.dynamicChildren && e && e.dynamicChildren && e.dynamicChildren.hasOnce && (t.dynamicChildren === n && (t.dynamicChildren = []), t.dynamicChildren.hasOnce = !0);
		let { type: u, ref: d, shapeFlag: f } = t;
		switch (u) {
			case Ci:
				y(e, t, r, i);
				break;
			case wi:
				b(e, t, r, i);
				break;
			case Ti:
				e ?? x(t, r, i, s);
				break;
			case W:
				ae(e, t, r, i, a, o, s, c, l);
				break;
			default: f & 1 ? w(e, t, r, i, a, o, s, c, l) : f & 6 ? D(e, t, r, i, a, o, s, c, l) : (f & 64 || f & 128) && u.process(e, t, r, i, a, o, s, c, l, Se);
		}
		d != null && a ? Wn(d, e && e.ref, o, t || e, !t) : d == null && e && e.ref != null && Wn(e.ref, null, o, e, !0);
	}, y = (e, t, n, r) => {
		if (e == null) o(t.el = u(t.children), n, r);
		else {
			let n = t.el = e.el;
			t.children !== e.children && f(n, t.children);
		}
	}, b = (e, t, n, r) => {
		e == null ? o(t.el = d(t.children || ""), n, r) : t.el = e.el;
	}, x = (e, t, n, r) => {
		[e.el, e.anchor] = _(e.children, t, n, r, e.el, e.anchor);
	}, S = ({ el: e, anchor: t }, n, r) => {
		let i;
		for (; e && e !== t;) i = h(e), o(e, n, r), e = i;
		o(t, n, r);
	}, C = ({ el: e, anchor: t }) => {
		let n;
		for (; e && e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, w = (e, t, n, r, i, a, o, s, c) => {
		if (t.type === "svg" ? o = "svg" : t.type === "math" && (o = "mathml"), e == null) te(t, n, r, i, a, o, s, c);
		else {
			let n = e.el && e.el._isVueCE ? e.el : null;
			try {
				n && n._beginPatch(), re(e, t, i, a, o, s, c);
			} finally {
				n && n._endPatch();
			}
		}
	}, te = (e, t, n, r, i, a, s, u) => {
		let d, f, { props: m, shapeFlag: h, transition: g, dirs: _ } = e;
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && T(e.children, d, null, r, i, pi(e, a), s, u), _ && En(e, null, r, "created"), ne(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !ee(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && Hi(f, r, e);
		}
		_ && En(e, null, r, "beforeMount");
		let v = hi(i, g);
		v && g.beforeEnter(d), o(d, t, n), ((f = m && m.onVnodeMounted) || v || _) && U(() => {
			try {
				f && Hi(f, r, e), v && g.enter(d), _ && En(e, null, r, "mounted");
			} finally {}
		}, i);
	}, ne = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (t === n || xi(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				ne(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, T = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? zi(e[l]) : Ri(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, re = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el, { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && mi(r, !1), (g = h.onVnodeBeforeUpdate) && Hi(g, r, n, e), f && En(n, e, r, "beforeUpdate"), r && mi(r, !0), d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? E(e.dynamicChildren, d, l, r, i, pi(n, a), o) : s || de(e, n, l, null, r, i, pi(n, a), o, !1), u > 0) {
			if (u & 16) ie(l, m, h, r, a);
			else if (u & 2 && m.class !== h.class && c(l, "class", null, h.class, a), u & 4 && c(l, "style", m.style, h.style, a), u & 8) {
				let e = n.dynamicProps;
				for (let t = 0; t < e.length; t++) {
					let n = e[t], i = m[n], o = h[n];
					(o !== i || n === "value") && c(l, n, i, o, a, r);
				}
			}
			u & 1 && e.children !== n.children && p(l, n.children);
		} else !s && d == null && ie(l, m, h, r, a);
		((g = h.onVnodeUpdated) || f) && U(() => {
			g && Hi(g, r, n, e), f && En(n, e, r, "updated");
		}, i);
	}, E = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === W || !Mi(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
			v(c, l, u, null, r, i, a, o, !0);
		}
	}, ie = (e, n, r, i, a) => {
		if (n !== r) {
			if (n !== t) for (let t in n) !ee(t) && !(t in r) && c(e, t, n[t], null, a, i);
			for (let t in r) {
				if (ee(t)) continue;
				let o = r[t], s = n[t];
				o !== s && t !== "value" && c(e, t, s, o, a, i);
			}
			"value" in r && c(e, "value", n.value, r.value, a);
		}
	}, ae = (e, t, n, r, i, a, s, c, l) => {
		let d = t.el = e ? e.el : u(""), f = t.anchor = e ? e.anchor : u(""), { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t;
		h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), T(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (E(e.dynamicChildren, m, n, i, a, s, c), (t.key != null || i && t === i.subTree) && gi(e, t, !0)) : de(e, t, n, f, i, a, s, c, l);
	}, D = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : O(t, n, r, i, a, o, c) : se(e, t, c);
	}, O = (e, t, n, r, i, a, o) => {
		let s = e.component = Gi(e, r, i);
		if (qn(e) && (s.ctx.renderer = Se), $i(s, !1, o), s.asyncDep) {
			if (i && i.registerDep(s, ce, o), !e.el) {
				let r = s.subTree = Y(wi);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else ce(s, e, t, n, i, a, o);
	}, se = (e, t, n) => {
		let r = t.component = e.component;
		if (Ur(e, t, n)) {
			if (r.asyncDep && !r.asyncResolved) {
				t.el = e.el, ue(r, t, n);
				return;
			}
			r.next = t, r.update();
		} else t.el = e.el, r.vnode = t;
	}, ce = (e, t, n, r, i, a, o) => {
		let s = () => {
			if (e.isMounted) {
				let { next: t, bu: n, u: r, parent: s, vnode: c } = e;
				{
					let n = vi(e);
					if (n) {
						t && (t.el = c.el, ue(e, t, o)), n.asyncDep.then(() => {
							U(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				mi(e, !1), t ? (t.el = c.el, ue(e, t, o)) : t = c, n && oe(n), (d = t.props && t.props.onVnodeBeforeUpdate) && Hi(d, s, t, c), mi(e, !0);
				let f = Br(e), p = e.subTree;
				e.subTree = f, v(p, f, m(p.el), ye(p), e, i, a), t.el = f.el, u === null && Kr(e, f.el), r && U(r, i), (d = t.props && t.props.onVnodeUpdated) && U(() => Hi(d, s, t, c), i);
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Kn(t);
				if (mi(e, !1), l && oe(l), !m && (o = c && c.onVnodeBeforeMount) && Hi(o, d, t), mi(e, !0), s && A) {
					let t = () => {
						e.subTree = Br(e), A(s, e.subTree, e, i, null);
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0);
					let o = e.subTree = Br(e);
					v(null, o, n, r, e, i, a), t.el = o.el;
				}
				if (u && U(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					U(() => Hi(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Kn(d.vnode) && d.vnode.shapeFlag & 256) && e.a && U(e.a, i), e.isMounted = !0, t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new ke(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => mn(u), mi(e, !0), l();
	}, ue = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, Zr(e, t.props, r, n), ui(e, t.children, n), We(), _n(e), Ge();
	}, de = (e, t, n, r, i, a, o, s, c = !1) => {
		let l = e && e.children, u = e ? e.shapeFlag : 0, d = t.children, { patchFlag: f, shapeFlag: m } = t;
		if (f > 0) {
			if (f & 128) {
				pe(l, d, n, r, i, a, o, s, c);
				return;
			}
			if (f & 256) {
				fe(l, d, n, r, i, a, o, s, c);
				return;
			}
		}
		m & 8 ? (u & 16 && ve(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? pe(l, d, n, r, i, a, o, s, c) : ve(l, i, a, !0) : (u & 8 && p(n, ""), m & 16 && T(d, n, r, i, a, o, s, c));
	}, fe = (e, t, r, i, a, o, s, c, l) => {
		e ||= n, t ||= n;
		let u = e.length, d = t.length, f = Math.min(u, d), p = 0;
		for (; p < f; p++) {
			let n = t[p] = l ? zi(t[p]) : Ri(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? ve(e, a, o, !0, !1, f) : T(t, r, i, a, o, s, c, l, f);
	}, pe = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? zi(t[u]) : Ri(t[u]);
			if (Mi(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? zi(t[p]) : Ri(t[p]);
			if (Mi(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? zi(t[u]) : Ri(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) k(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? zi(t[u]) : Ri(t[u]);
				e.key != null && g.set(e.key, u);
			}
			let _, y = 0, b = p - h + 1, x = !1, S = 0, C = Array(b);
			for (u = 0; u < b; u++) C[u] = 0;
			for (u = m; u <= f; u++) {
				let n = e[u];
				if (y >= b) {
					k(n, a, o, !0);
					continue;
				}
				let i;
				if (n.key != null) i = g.get(n.key);
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && Mi(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? k(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? _i(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || bi(f) : i;
				C[u] === 0 ? v(null, n, r, p, a, o, s, c, l) : x && (_ < 0 || u !== w[_] ? me(n, r, p, 2) : _--);
			}
		}
	}, me = (e, t, n, r, i = null) => {
		let { el: a, type: c, transition: l, children: u, shapeFlag: d } = e;
		if (d & 6) {
			me(e.component.subTree, t, n, r);
			return;
		}
		if (d & 128) {
			e.suspense.move(t, n, r);
			return;
		}
		if (d & 64) {
			c.move(e, t, n, Se);
			return;
		}
		if (c === W) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) me(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === Ti) {
			S(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[Ln] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), U(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[Ln];
					a._isLeaving && a[Ln](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, k = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if ((d === -2 || l && l.hasOnce) && (i = !1), s != null && (We(), Wn(s, null, n, e, !0), Ge()), p != null && (!e.ctx || e.ctx === t) && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Kn(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && Hi(_, t, e), u & 6) _e(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && En(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, Se, r) : l && !l.hasOnce && (a !== W || d > 0 && d & 64) ? ve(l, t, n, !1, !0) : (a === W && d & 384 || !i && u & 16) && ve(c, t, n), r && he(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && U(() => {
			_ && Hi(_, t, e), h && En(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, he = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === W) {
			ge(n, r);
			return;
		}
		if (t === Ti) {
			C(e), i && !i.persisted && i.afterLeave && i.afterLeave();
			return;
		}
		let a = () => {
			s(n), i && !i.persisted && i.afterLeave && i.afterLeave();
		};
		if (e.shapeFlag & 1 && i && !i.persisted) {
			let { leave: t, delayLeave: r } = i, o = () => t(n, a);
			r ? r(e.el, a, o) : o();
		} else a();
	}, ge = (e, t) => {
		let n;
		for (; e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, _e = (e, t, n) => {
		let { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e;
		yi(c), yi(l), r && oe(r), i.stop(), a ? (a.flags |= 8, k(o, e, t, n)) : e.vnode.el && o && (o.transition = e.vnode.transition, k(o, e, t, n)), s && U(s, t), U(() => {
			e.isUnmounted = !0;
		}, t);
	}, ve = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) k(e[o], t, n, r, i);
	}, ye = (e) => {
		if (e.shapeFlag & 6) return ye(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[Fn];
		return n ? h(n) : t;
	}, be = !1, xe = (e, t, n) => {
		let r;
		e == null ? t._vnode && (k(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, be ||= (be = !0, _n(r), vn(), !1);
	}, Se = {
		p: v,
		um: k,
		m: me,
		r: he,
		mt: O,
		mc: T,
		pc: de,
		pbc: E,
		n: ye,
		o: e
	}, Ce, A;
	return i && ([Ce, A] = i(Se)), {
		render: xe,
		hydrate: Ce,
		createApp: Nr(xe, Ce)
	};
}
function pi({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function mi({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function hi(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function gi(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = zi(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && gi(t, a)), a.type === Ci && (a.patchFlag === -1 && (a = i[e] = zi(a)), a.el = t.el), a.type === wi && !a.el && (a.el = t.el);
	}
}
function _i(e) {
	let t = e.slice(), n = [0], r, i, a, o, s, c = e.length;
	for (r = 0; r < c; r++) {
		let c = e[r];
		if (c !== 0) {
			if (i = n[n.length - 1], e[i] < c) {
				t[r] = i, n.push(r);
				continue;
			}
			for (a = 0, o = n.length - 1; a < o;) s = a + o >> 1, e[n[s]] < c ? a = s + 1 : o = s;
			c < e[n[a]] && (a > 0 && (t[r] = n[a - 1]), n[a] = r);
		}
	}
	for (a = n.length, o = n[a - 1]; a-- > 0;) n[a] = o, o = t[o];
	return n;
}
function vi(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : vi(t);
}
function yi(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function bi(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? bi(t.subTree) : null;
}
var xi = (e) => e.__isSuspense;
function Si(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : gn(e);
}
var W = /* @__PURE__ */ Symbol.for("v-fgt"), Ci = /* @__PURE__ */ Symbol.for("v-txt"), wi = /* @__PURE__ */ Symbol.for("v-cmt"), Ti = /* @__PURE__ */ Symbol.for("v-stc"), Ei = [], G = null;
function K(e = !1) {
	Ei.push(G = e ? null : []);
}
function Di() {
	Ei.pop(), G = Ei[Ei.length - 1] || null;
}
var Oi = 1;
function ki(e, t = !1) {
	Oi += e, e < 0 && G && t && (G.hasOnce = !0);
}
function Ai(e) {
	return e.dynamicChildren = Oi > 0 ? G || n : null, Di(), Oi > 0 && G && G.push(e), e;
}
function q(e, t, n, r, i, a) {
	return Ai(J(e, t, n, r, i, a, !0));
}
function ji(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function Mi(e, t) {
	return e.type === t.type && e.key === t.key;
}
var Ni = ({ key: e }) => e ?? null, Pi = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ R(e) || h(e) ? {
	i: xn,
	r: e,
	k: t,
	f: !!n
} : e);
function J(e, t = null, n = null, r = 0, i = null, a = e === W ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && Ni(t),
		ref: t && Pi(t),
		scopeId: Sn,
		slotScopeIds: null,
		children: n,
		component: null,
		suspense: null,
		ssContent: null,
		ssFallback: null,
		dirs: null,
		transition: null,
		el: null,
		anchor: null,
		target: null,
		targetStart: null,
		targetAnchor: null,
		staticCount: 0,
		shapeFlag: a,
		patchFlag: r,
		dynamicProps: i,
		dynamicChildren: null,
		appContext: null,
		ctx: xn
	};
	return s ? (Bi(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), Oi > 0 && !o && G && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && G.push(c), c;
}
var Y = Fi;
function Fi(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === ur) && (e = wi), ji(e)) {
		let r = Li(e, t, !0);
		return n && Bi(r, n), Oi > 0 && !a && G && (r.shapeFlag & 6 ? G[G.indexOf(e)] = r : G.push(r)), r.patchFlag = -2, r;
	}
	if (oa(e) && (e = e.__vccOpts), t) {
		t = Ii(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = k(e)), v(n) && (/* @__PURE__ */ Bt(n) && !d(n) && (n = s({}, n)), t.style = ue(n));
	}
	let o = g(e) ? 1 : xi(e) ? 128 : In(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return J(e, t, n, r, i, o, a, !0);
}
function Ii(e) {
	return e ? /* @__PURE__ */ Bt(e) || Yr(e) ? s({}, e) : e : null;
}
function Li(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? Vi(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && Ni(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(Pi(t)) : [a, Pi(t)] : Pi(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== W ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && Li(e.ssContent),
		ssFallback: e.ssFallback && Li(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce,
		cacheIndex: e.cacheIndex
	};
	return c && r && Bn(u, c.clone(u)), u;
}
function X(e = " ", t = 0) {
	return Y(Ci, null, e, t);
}
function Ri(e) {
	return e == null || typeof e == "boolean" ? Y(wi) : d(e) ? Y(W, null, e.slice()) : ji(e) ? zi(e) : Y(Ci, null, String(e));
}
function zi(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : Li(e);
}
function Bi(e, t) {
	let n = 0, { shapeFlag: r } = e;
	if (t == null) t = null;
	else if (d(t)) n = 16;
	else if (typeof t == "object") {
		if (r & 65) {
			let n = t.default;
			n && (n._c && (n._d = !1), Bi(e, n()), n._c && (n._d = !0));
			return;
		}
		{
			n = 32;
			let r = t._;
			!r && !Yr(t) ? t._ctx = xn : r === 3 && xn && (xn.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			Bi(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: xn
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [X(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function Vi(...e) {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		for (let e in r) if (e === "class") t.class !== r.class && (t.class = k([t.class, r.class]));
		else if (e === "style") t.style = ue([t.style, r.style]);
		else if (a(e)) {
			let n = t[e], i = r[e];
			i && n !== i && !(d(n) && n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !o(e) && (t[e] = i);
		} else e !== "" && (t[e] = r[e]);
	}
	return t;
}
function Hi(e, t, n, r = null) {
	nn(e, t, 7, [n, r]);
}
var Ui = jr(), Wi = 0;
function Gi(e, n, r) {
	let i = e.type, a = (n ? n.appContext : e.appContext) || Ui, o = {
		uid: Wi++,
		vnode: e,
		type: i,
		parent: n,
		appContext: a,
		root: null,
		next: null,
		subTree: null,
		effect: null,
		update: null,
		job: null,
		scope: new Ee(!0),
		render: null,
		proxy: null,
		exposed: null,
		exposeProxy: null,
		withProxy: null,
		provides: n ? n.provides : Object.create(a.provides),
		ids: n ? n.ids : [
			"",
			0,
			0
		],
		accessCache: null,
		renderCache: [],
		components: null,
		directives: null,
		propsOptions: ti(i, a),
		emitsOptions: Rr(i, a),
		emit: null,
		emitted: null,
		propsDefaults: t,
		inheritAttrs: i.inheritAttrs,
		ctx: t,
		data: t,
		props: t,
		attrs: t,
		slots: t,
		refs: t,
		setupState: t,
		setupContext: null,
		suspense: r,
		suspenseId: r ? r.pendingId : 0,
		asyncDep: null,
		asyncResolved: !1,
		isMounted: !1,
		isUnmounted: !1,
		isDeactivated: !1,
		bc: null,
		c: null,
		bm: null,
		m: null,
		bu: null,
		u: null,
		um: null,
		bum: null,
		da: null,
		a: null,
		rtg: null,
		rtc: null,
		ec: null,
		sp: null
	};
	return o.ctx = { _: o }, o.root = n ? n.root : o, o.emit = Ir.bind(null, o), e.ce && e.ce(o), o;
}
var Z = null, Ki = () => Z || xn, qi, Ji;
{
	let e = le(), t = (t, n) => {
		let r;
		return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => {
			r.length > 1 ? r.forEach((t) => t(e)) : r[0](e);
		};
	};
	qi = t("__VUE_INSTANCE_SETTERS__", (e) => Z = e), Ji = t("__VUE_SSR_SETTERS__", (e) => Qi = e);
}
var Yi = (e) => {
	let t = Z;
	return qi(e), e.scope.on(), () => {
		e.scope.off(), qi(t);
	};
}, Xi = () => {
	Z && Z.scope.off(), qi(null);
};
function Zi(e) {
	return e.vnode.shapeFlag & 4;
}
var Qi = !1;
function $i(e, t = !1, n = !1) {
	t && Ji(t);
	let { props: r, children: i } = e.vnode, a = Zi(e);
	Xr(e, r, a, t), li(e, i, n || t);
	let o = a ? ea(e, t) : void 0;
	return t && Ji(!1), o;
}
function ea(e, t) {
	let n = e.type;
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, hr);
	let { setup: r } = n;
	if (r) {
		We();
		let n = e.setupContext = r.length > 1 ? ia(e) : null, i = Yi(e), a = tn(r, e, 0, [e.props, n]), o = y(a);
		if (Ge(), i(), (o || e.sp) && !Kn(e) && Vn(e), o) {
			if (a.then(Xi, Xi), t) return a.then((n) => {
				Ji(!0);
				try {
					ta(e, n, t);
				} finally {
					Ji(!1);
				}
			}).catch((t) => {
				rn(t, e, 0);
			});
			e.asyncDep = a;
		} else ta(e, a, t);
	} else na(e, t);
}
function ta(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) && (e.setupState = Kt(t)), na(e, n);
}
function na(e, t, n) {
	let i = e.type;
	e.render ||= i.render || r;
	{
		let t = Yi(e);
		We();
		try {
			vr(e);
		} finally {
			Ge(), t();
		}
	}
}
var ra = { get(e, t) {
	return N(e, "get", ""), e[t];
} };
function ia(e) {
	return {
		attrs: new Proxy(e.attrs, ra),
		slots: e.slots,
		emit: e.emit,
		expose: (t) => {
			e.exposed = t || {};
		}
	};
}
function aa(e) {
	return e.exposed ? e.exposeProxy ||= new Proxy(Kt(Vt(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in pr) return pr[n](e);
		},
		has(e, t) {
			return t in e || t in pr;
		}
	}) : e.proxy;
}
function oa(e) {
	return h(e) && "__vccOpts" in e;
}
var Q = (e, t) => /* @__PURE__ */ Jt(e, t, Qi), sa = "3.5.43", ca = void 0, la = typeof window < "u" && window.trustedTypes;
if (la) try {
	ca = /* @__PURE__ */ la.createPolicy("vue", { createHTML: (e) => e });
} catch {}
var ua = ca ? (e) => ca.createHTML(e) : (e) => e, da = "http://www.w3.org/2000/svg", fa = "http://www.w3.org/1998/Math/MathML", pa = typeof document < "u" ? document : null, ma = pa && /* @__PURE__ */ pa.createElement("template"), ha = {
	insert: (e, t, n) => {
		t.insertBefore(e, n || null);
	},
	remove: (e) => {
		let t = e.parentNode;
		t && t.removeChild(e);
	},
	createElement: (e, t, n, r) => {
		let i = t === "svg" ? pa.createElementNS(da, e) : t === "mathml" ? pa.createElementNS(fa, e) : n ? pa.createElement(e, { is: n }) : pa.createElement(e);
		return e === "select" && r && r.multiple != null && i.setAttribute("multiple", r.multiple), i;
	},
	createText: (e) => pa.createTextNode(e),
	createComment: (e) => pa.createComment(e),
	setText: (e, t) => {
		e.nodeValue = t;
	},
	setElementText: (e, t) => {
		e.textContent = t;
	},
	parentNode: (e) => e.parentNode,
	nextSibling: (e) => e.nextSibling,
	querySelector: (e) => pa.querySelector(e),
	setScopeId(e, t) {
		e.setAttribute(t, "");
	},
	insertStaticContent(e, t, n, r, i, a) {
		let o = n ? n.previousSibling : t.lastChild;
		if (i && (i === a || i.nextSibling)) for (; t.insertBefore(i.cloneNode(!0), n), i !== a && (i = i.nextSibling););
		else {
			ma.innerHTML = ua(r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e);
			let i = ma.content;
			if (r === "svg" || r === "mathml") {
				let e = i.firstChild;
				for (; e.firstChild;) i.appendChild(e.firstChild);
				i.removeChild(e);
			}
			t.insertBefore(i, n);
		}
		return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
	}
}, ga = /* @__PURE__ */ Symbol("_vtc");
function _a(e, t, n) {
	let r = e[ga];
	r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
var va = /* @__PURE__ */ Symbol("_vod"), ya = /* @__PURE__ */ Symbol("_vsh"), ba = {
	name: "show",
	beforeMount(e, { value: t }, { transition: n }) {
		e[va] = e.style.display === "none" ? "" : e.style.display, n && t ? n.beforeEnter(e) : xa(e, t);
	},
	mounted(e, { value: t }, { transition: n }) {
		n && t && n.enter(e);
	},
	updated(e, { value: t, oldValue: n }, { transition: r }) {
		!t != !n && (r ? t ? (r.beforeEnter(e), xa(e, !0), r.enter(e)) : r.leave(e, () => {
			xa(e, !1);
		}) : xa(e, t));
	},
	beforeUnmount(e, { value: t }) {
		xa(e, t);
	}
};
function xa(e, t) {
	e.style.display = t ? e[va] : "none", e[ya] = !t;
}
var Sa = /* @__PURE__ */ Symbol(""), Ca = /(?:^|;)\s*display\s*:/;
function wa(e, t, n) {
	let r = e.style, i = g(n), a = !1;
	if (n && !i) {
		if (t) {
			if (g(t)) for (let e of t.split(";")) {
				let t = e.slice(0, e.indexOf(":")).trim();
				n[t] ?? Ea(r, t, "");
			}
			else for (let e in t) n[e] ?? Ea(r, e, "");
		}
		for (let i in n) {
			i === "display" && (a = !0);
			let o = n[i];
			o == null ? Ea(r, i, "") : Aa(e, i, !g(t) && t ? t[i] : void 0, o) || Ea(r, i, o);
		}
	} else if (i) {
		if (t !== n) {
			let e = r[Sa];
			e && (n += ";" + e), r.cssText = n, a = Ca.test(n);
		}
	} else t && e.removeAttribute("style");
	va in e && (e[va] = a ? r.display : "", e[ya] && (r.display = "none"));
}
var Ta = /\s*!important$/;
function Ea(e, t, n) {
	if (d(n)) n.forEach((n) => Ea(e, t, n));
	else if (n ??= "", t.startsWith("--")) Ta.test(n) ? e.setProperty(t, n.replace(Ta, ""), "important") : e.setProperty(t, n);
	else {
		let r = ka(e, t);
		Ta.test(n) ? e.setProperty(E(r), n.replace(Ta, ""), "important") : e[r] = n;
	}
}
var Da = [
	"Webkit",
	"Moz",
	"ms"
], Oa = {};
function ka(e, t) {
	let n = Oa[t];
	if (n) return n;
	let r = T(t);
	if (r !== "filter" && r in e) return Oa[t] = r;
	r = ie(r);
	for (let n = 0; n < Da.length; n++) {
		let i = Da[n] + r;
		if (i in e) return Oa[t] = i;
	}
	return t;
}
function Aa(e, t, n, r) {
	return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && g(r) && n === r;
}
var ja = "http://www.w3.org/1999/xlink";
function Ma(e, t, n, r, i, a = ge(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(ja, t.slice(6, t.length)) : e.setAttributeNS(ja, t, n) : n == null || a && !_e(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
}
function Na(e, t, n, r, i) {
	if (t === "innerHTML" || t === "textContent") {
		n != null && (e[t] = t === "innerHTML" ? ua(n) : n);
		return;
	}
	let a = e.tagName;
	if (t === "value" && a !== "PROGRESS" && !a.includes("-")) {
		let r = a === "OPTION" ? e.getAttribute("value") || "" : e.value, i = n == null ? e.type === "checkbox" ? "on" : "" : String(n);
		(r !== i || !("_value" in e)) && (e.value = i), n ?? e.removeAttribute(t), e._value = n;
		return;
	}
	let o = !1;
	if (n === "" || n == null) {
		let r = typeof e[t];
		r === "boolean" ? n = _e(n) : n == null && r === "string" ? (n = "", o = !0) : r === "number" && (n = 0, o = !0);
	}
	try {
		e[t] = n;
	} catch {}
	o && e.removeAttribute(i || t);
}
function Pa(e, t, n, r) {
	e.addEventListener(t, n, r);
}
function Fa(e, t, n, r) {
	e.removeEventListener(t, n, r);
}
var Ia = /* @__PURE__ */ Symbol("_vei");
function La(e, t, n, r, i = null) {
	let a = e[Ia] || (e[Ia] = {}), o = a[t];
	if (r && o) o.value = r;
	else {
		let [n, s] = Ba(t);
		r ? Pa(e, n, a[t] = Wa(r, i), s) : o && (Fa(e, n, o, s), a[t] = void 0);
	}
}
var Ra = /(Once|Passive|Capture)$/, za = /^on:?(?:Once|Passive|Capture)$/;
function Ba(e) {
	let t, n;
	for (; (n = e.match(Ra)) && !za.test(e);) t ||= {}, e = e.slice(0, e.length - n[1].length), t[n[1].toLowerCase()] = !0;
	return [e[2] === ":" ? e.slice(3) : E(e.slice(2)), t];
}
var Va = 0, Ha = /* @__PURE__ */ Promise.resolve(), Ua = () => Va ||= (Ha.then(() => Va = 0), Date.now());
function Wa(e, t) {
	let n = (e) => {
		if (!e._vts) e._vts = Date.now();
		else if (e._vts <= n.attached) return;
		let r = n.value;
		if (d(r)) {
			let n = e.stopImmediatePropagation;
			e.stopImmediatePropagation = () => {
				n.call(e), e._stopped = !0;
			};
			let i = r.slice(), a = [e];
			for (let n = 0; n < i.length && !e._stopped; n++) {
				let e = i[n];
				e && nn(e, t, 5, a);
			}
		} else nn(r, t, 5, [e]);
	};
	return n.value = e, n.attached = Ua(), n;
}
var Ga = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Ka = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? _a(e, r, c) : t === "style" ? wa(e, n, r) : a(t) ? o(t) || La(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), 1) : t[0] === "^" ? (t = t.slice(1), 0) : qa(e, t, r, c)) ? (Na(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && Ma(e, t, r, c, s, t !== "value")) : e._isVueCE && (Ja(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? Na(e, T(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), Ma(e, t, r, c));
};
function qa(e, t, n, r) {
	if (r) return !!(t === "innerHTML" || t === "textContent" || t in e && Ga(t) && h(n));
	if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA") return !1;
	if (t === "width" || t === "height") {
		let t = e.tagName;
		if (t === "IMG" || t === "VIDEO" || t === "CANVAS" || t === "SOURCE") return !1;
	}
	return Ga(t) && g(n) ? !1 : t in e;
}
function Ja(e, t) {
	let n = e._def.props;
	if (!n) return !1;
	let r = T(t);
	return Array.isArray(n) ? n.some((e) => T(e) === r) : Object.keys(n).some((e) => T(e) === r);
}
var Ya = (e) => {
	let t = e.props["onUpdate:modelValue"] || !1;
	return d(t) ? (e) => oe(t, e) : t;
};
function Xa(e) {
	e.target.composing = !0;
}
function Za(e) {
	let t = e.target;
	t.composing && (t.composing = !1, t.dispatchEvent(new Event("input")));
}
var Qa = /* @__PURE__ */ Symbol("_assign"), $a = /* @__PURE__ */ Symbol("_initialValue");
function eo(e, t, n) {
	return t && (e = e.trim()), n && (e = se(e)), e;
}
var to = {
	created(e, { modifiers: { lazy: t, trim: n, number: r } }, i) {
		e.parentNode && (e.type === "text" ? e[$a] = e.defaultValue.replace(/[\r\n]/g, "") : e.type === "textarea" && (e[$a] = e.defaultValue.replace(/\r\n?/g, "\n"))), e[Qa] = Ya(i);
		let a = r || i.props && i.props.type === "number";
		Pa(e, t ? "change" : "input", (t) => {
			t.target.composing || e[Qa](eo(e.value, n, a));
		}), (n || a) && Pa(e, "change", () => {
			e.value = eo(e.value, n, a);
		}), t || (Pa(e, "compositionstart", Xa), Pa(e, "compositionend", Za), Pa(e, "change", Za));
	},
	mounted(e, { value: t, modifiers: { trim: n, number: r } }) {
		let i = t ?? "", a = e[$a];
		delete e[$a], a !== void 0 && (e.type === "text" || e.type === "textarea") && e.value !== a ? e[Qa](eo(e.value, n, r)) : e.value = i;
	},
	beforeUpdate(e, { value: t, oldValue: n, modifiers: { lazy: r, trim: i, number: a } }, o) {
		if (e[Qa] = Ya(o), e.composing) return;
		let s = (a || e.type === "number") && !/^0\d/.test(e.value) ? se(e.value) : e.value, c = t ?? "";
		if (s === c) return;
		let l = e.getRootNode();
		(l instanceof Document || l instanceof ShadowRoot) && l.activeElement === e && e.type !== "range" && (r && t === n || i && e.value.trim() === c) || (e.value = c);
	}
}, no = /* @__PURE__ */ s({ patchProp: Ka }, ha), ro;
function io() {
	return ro ||= di(no);
}
var ao = ((...e) => {
	let t = io().createApp(...e), { mount: n } = t;
	return t.mount = (e) => {
		let r = so(e);
		if (!r) return;
		let i = t._component;
		!h(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
		let a = n(r, !1, oo(r));
		return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), a;
	}, t;
});
function oo(e) {
	if (e instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && e instanceof MathMLElement) return "mathml";
}
function so(e) {
	return g(e) ? document.querySelector(e) : e;
}
//#endregion
//#region src/lib/source-order.js
var co = [
	"ddg",
	"bing",
	"so360",
	"baidu"
], lo = {
	ddg: "DuckDuckGo",
	bing: "Bing",
	so360: "360 搜索",
	baidu: "百度"
}, uo = {
	ddg: "html/lite 端点 · 免 key · 基础回退源",
	bing: "cn.bing.com · 免 key · CJK 查询优先",
	so360: "so.com · 免 key",
	baidu: "baidu.com · 免 key · CJK 回退源"
}, fo = Object.fromEntries(co.map((e) => [e, !0]));
function po(e, t = co) {
	let n = [];
	if (!Array.isArray(e)) return {
		ok: !1,
		errors: ["priority 必须是数组"]
	};
	e.length !== t.length && n.push(`priority 长度必须为 ${t.length}（全排列）`);
	for (let r of e) t.includes(r) ? e.filter((e) => e === r).length !== 1 && n.push(`priority 重复源：${r}`) : n.push(`priority 含未知源：${String(r)}`);
	return {
		ok: n.length === 0,
		errors: n
	};
}
function mo(e, t, n) {
	let r = [...e], i = r.indexOf(t), a = i + n;
	return i < 0 || a < 0 || a >= r.length || ([r[i], r[a]] = [r[a], r[i]]), r;
}
function ho(e, t) {
	return co.includes(t) ? {
		...e,
		[t]: !e[t]
	} : { ...e };
}
function go(e) {
	return co.filter((t) => e[t]).length;
}
function _o(e) {
	return go(e ?? {}) > 0 ? {
		ok: !0,
		errors: []
	} : {
		ok: !1,
		errors: ["至少启用一个搜索源（当前四源全关，web_search 将无源可用）"]
	};
}
//#endregion
//#region src/components/SourceCard.vue
var vo = {
	class: "cs-card",
	"aria-label": "源管理"
}, yo = { class: "cs-card-head" }, bo = { class: "cs-count" }, xo = { class: "cs-rows" }, So = { class: "cs-order" }, Co = { class: "cs-row-main" }, wo = { class: "cs-row-label" }, To = { class: "cs-row-desc" }, Eo = { class: "cs-row-control" }, Do = ["disabled", "onClick"], Oo = ["disabled", "onClick"], ko = [
	"aria-checked",
	"aria-label",
	"onClick"
], Ao = { class: "cs-hint cs-error" }, jo = {
	__name: "SourceCard",
	props: {
		sources: {
			type: Object,
			required: !0
		},
		priority: {
			type: Array,
			required: !0
		},
		customCount: {
			type: Number,
			default: 0
		},
		error: {
			type: String,
			default: ""
		}
	},
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = Q(() => {
			let e = `已启用 ${go(n.sources)}`;
			return n.customCount > 0 ? `${co.length + n.customCount} 源（含 ${n.customCount} 自定义） · ${e}` : `${co.length} 源 · ${e}`;
		});
		function a(e) {
			r("change", { sources: ho(n.sources, e) });
		}
		function o(e, t) {
			r("change", { priority: mo(n.priority, e, t) });
		}
		return (t, n) => (K(), q("section", vo, [
			J("div", yo, [n[0] ||= J("h2", { class: "cs-card-title" }, "源管理", -1), J("span", bo, A(i.value), 1)]),
			n[2] ||= J("p", { class: "cs-card-desc" }, " 按优先级自上而下回退；单源失败自动切换下一家，反爬/验证码命中即停不重试 ", -1),
			J("div", xo, [(K(!0), q(W, null, dr(e.priority, (t, r) => (K(), q("div", {
				key: t,
				class: "cs-row"
			}, [
				J("span", So, A(r + 1), 1),
				J("div", Co, [J("div", wo, A(B(lo)[t]), 1), J("div", To, A(B(uo)[t]), 1)]),
				J("div", Eo, [
					J("button", {
						class: "cs-step-btn",
						type: "button",
						disabled: r === 0,
						"aria-label": "上移一位",
						onClick: (e) => o(t, -1)
					}, "▲", 8, Do),
					J("button", {
						class: "cs-step-btn",
						type: "button",
						disabled: r === e.priority.length - 1,
						"aria-label": "下移一位",
						onClick: (e) => o(t, 1)
					}, "▼", 8, Oo),
					J("button", {
						class: k(["cs-switch", { "is-off": !e.sources[t] }]),
						type: "button",
						role: "switch",
						"aria-checked": String(!!e.sources[t]),
						"aria-label": `${B(lo)[t]} 开关`,
						onClick: (e) => a(t)
					}, [...n[1] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, ko)
				])
			]))), 128))]),
			n[3] ||= J("div", { class: "cs-hint" }, [J("span", null, [
				X("▲▼ 调整优先级顺序（"),
				J("code", null, "sources.priority"),
				X("）；开关对应 "),
				J("code", null, "sources.<id>"),
				X("（ddg/bing/so360/baidu），任一源关闭即跳过")
			])], -1),
			J("div", Ao, A(e.error), 1)
		]));
	}
}, Mo = [
	"timeoutMs",
	"retries",
	"chainBudgetMs",
	"maxResults",
	"cacheTtlMs",
	"egoBudget"
], No = {
	timeoutMs: 12e3,
	retries: 3,
	chainBudgetMs: 3e4,
	maxResults: 8,
	cacheTtlMs: 6e5,
	egoBudget: 15
}, Po = [
	{
		key: "timeoutMs",
		label: "单查询超时",
		desc: "单个搜索源请求超时，超时即切换下一家",
		unit: "s",
		min: 1,
		integer: !0
	},
	{
		key: "retries",
		label: "失败重试",
		desc: "单源失败重试次数，重试间隔 1.5s",
		unit: "次",
		min: 0,
		integer: !0
	},
	{
		key: "chainBudgetMs",
		label: "整链预算",
		desc: "四源聚合总预算（AbortSignal.any 熔断）",
		unit: "s",
		min: 1,
		integer: !0
	},
	{
		key: "maxResults",
		label: "结果条数",
		desc: "返回给模型的结果条数，clamp 1–10",
		unit: "条",
		min: 1,
		max: 10,
		integer: !0
	},
	{
		key: "cacheTtlMs",
		label: "缓存 TTL",
		desc: "LRU 50 条；命中缓存不发起网络请求",
		unit: "分钟",
		min: 0,
		integer: !0
	},
	{
		key: "egoBudget",
		label: "ego-browser 兜底预算",
		desc: "单任务工具调用上限，超限即熔断明示",
		unit: "次",
		min: 0,
		integer: !0
	}
];
function Fo(e) {
	return Math.min(10, Math.max(1, Number(e)));
}
var Io = {
	retryBackoffMs: 300,
	maxResponseBytes: 1048576,
	logCapacity: 200,
	healthTimeoutMs: 5e3,
	proxies: [],
	useProxy: {
		ddg: !0,
		bing: !0,
		so360: !1,
		baidu: !1
	},
	custom: []
}, Lo = [
	"retryBackoffMs",
	"maxResponseBytes",
	"logCapacity",
	"healthTimeoutMs"
];
function Ro(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.sources && typeof t.sources == "object" ? t.sources : {}, r = {};
	for (let e of Lo) {
		let n = Number(t[e]);
		Number.isFinite(n) && n >= 0 && (r[e] = Math.round(n));
	}
	let i = Array.isArray(t.proxies) ? t.proxies : Array.isArray(n.proxies) ? n.proxies : null;
	i && (r.proxies = [...i]);
	let a = t.useProxy && typeof t.useProxy == "object" && !Array.isArray(t.useProxy) ? t.useProxy : n.useProxy && typeof n.useProxy == "object" && !Array.isArray(n.useProxy) ? n.useProxy : null;
	a && (r.useProxy = { ...a });
	let o = Array.isArray(t.custom) ? t.custom : Array.isArray(n.custom) ? n.custom : null;
	return o && (r.custom = [...o]), r;
}
function zo(e) {
	let t = e && typeof e == "object" ? e : {}, n = {
		...Io,
		...Ro(t)
	};
	return {
		retryBackoffMs: n.retryBackoffMs,
		maxResponseBytes: n.maxResponseBytes,
		logCapacity: n.logCapacity,
		healthTimeoutMs: n.healthTimeoutMs,
		proxies: n.proxies,
		sources: {
			custom: n.custom,
			useProxy: n.useProxy
		}
	};
}
var Bo = {
	min: 1,
	max: 10,
	step: 1
}, Vo = [
	{
		valueMs: 6e4,
		label: "1 分钟"
	},
	{
		valueMs: 3e5,
		label: "5 分钟"
	},
	{
		valueMs: 6e5,
		label: "10 分钟"
	},
	{
		valueMs: 18e5,
		label: "30 分钟"
	}
];
function Ho(e) {
	return Math.round(e / 1e3);
}
function Uo(e) {
	return Math.round(Number(e) * 1e3);
}
function Wo(e, t = {}) {
	let { min: n = 1, max: r = Infinity, integer: i = !0, label: a = "值" } = t, o = typeof e == "number" ? e : Number(String(e).trim());
	return Number.isFinite(o) ? i && !Number.isInteger(o) ? {
		ok: !1,
		message: `${a}必须是整数`,
		parsed: null
	} : o < n ? {
		ok: !1,
		message: `${a}不得小于 ${n}`,
		parsed: null
	} : o > r ? {
		ok: !1,
		message: `${a}不得大于 ${r}`,
		parsed: null
	} : {
		ok: !0,
		message: "",
		parsed: o
	} : {
		ok: !1,
		message: `${a}必须是数字`,
		parsed: null
	};
}
function Go(e, t) {
	let n = Po.find((t) => t.key === e);
	if (!n) return {
		ok: !1,
		message: `未知预算字段：${e}`,
		value: null
	};
	if (e === "maxResults") {
		let e = Wo(t, {
			...n,
			max: Infinity,
			label: n.label
		});
		return e.ok ? {
			ok: !0,
			message: "",
			value: Fo(e.parsed)
		} : {
			ok: !1,
			message: e.message,
			value: null
		};
	}
	let r = Wo(t, {
		...n,
		label: n.label
	});
	return {
		ok: r.ok,
		message: r.message,
		value: r.parsed
	};
}
//#endregion
//#region src/components/BudgetCard.vue
var Ko = {
	class: "cs-card",
	"aria-label": "性能预算"
}, qo = { class: "cs-rows" }, Jo = { class: "cs-row-main" }, Yo = { class: "cs-row-label" }, Xo = { class: "cs-row-desc" }, Zo = { class: "cs-row-control" }, Qo = [
	"min",
	"value",
	"aria-label",
	"onChange"
], $o = { class: "cs-unit" }, es = { class: "cs-row-note" }, ts = { class: "cs-row-note cs-error" }, ns = { class: "cs-row" }, rs = { class: "cs-row-control cs-slider-wrap" }, is = [
	"min",
	"max",
	"step",
	"value"
], as = [
	"min",
	"max",
	"value"
], os = { class: "cs-row-note cs-error" }, ss = { class: "cs-row" }, cs = { class: "cs-row-control" }, ls = ["value"], us = ["value"], ds = { class: "cs-row-note cs-error" }, fs = {
	__name: "BudgetCard",
	props: {
		values: {
			type: Object,
			required: !0
		},
		errors: {
			type: Object,
			default: () => ({})
		}
	},
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = Q(() => Po.filter((e) => e.key === "timeoutMs" || e.key === "retries" || e.key === "chainBudgetMs" || e.key === "egoBudget"));
		function a(e) {
			return e === "timeoutMs" || e === "chainBudgetMs" ? Ho(n.values[e]) : n.values[e];
		}
		function o(e, t) {
			let i = Go(e, e === "timeoutMs" || e === "chainBudgetMs" ? Uo(t) : t);
			if (!i.ok) {
				r("change", {
					[e]: n.values[e],
					fieldError: { [e]: i.message }
				});
				return;
			}
			r("change", {
				[e]: i.value,
				fieldError: { [e]: "" }
			});
		}
		function s(e) {
			r("change", {
				maxResults: Fo(e),
				fieldError: { maxResults: "" }
			});
		}
		function c(e) {
			r("change", {
				cacheTtlMs: Number(e),
				fieldError: { cacheTtlMs: "" }
			});
		}
		return (t, n) => (K(), q("section", Ko, [
			n[7] ||= J("div", { class: "cs-card-head" }, [J("h2", { class: "cs-card-title" }, "性能预算"), J("span", { class: "cs-count" }, "默认值 = R5 确认值")], -1),
			n[8] ||= J("p", { class: "cs-card-desc" }, "超时/重试/整链预算为单调熔断守卫：整链超预算即中止并明示失败原因", -1),
			J("div", qo, [
				(K(!0), q(W, null, dr(i.value, (t) => (K(), q("div", {
					key: t.key,
					class: "cs-row"
				}, [J("div", Jo, [J("div", Yo, A(t.label), 1), J("div", Xo, A(t.desc), 1)]), J("div", Zo, [
					J("input", {
						class: "cs-num",
						type: "number",
						min: t.key === "timeoutMs" || t.key === "chainBudgetMs" ? 1 : t.min,
						value: a(t.key),
						"aria-label": t.label,
						onChange: (e) => o(t.key, e.target.value)
					}, null, 40, Qo),
					J("span", $o, A(t.unit), 1),
					J("span", es, A(t.key === "egoBudget" ? "上限守卫" : ""), 1),
					J("span", ts, A(e.errors[t.key] || ""), 1)
				])]))), 128)),
				J("div", ns, [n[5] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "结果条数"), J("div", { class: "cs-row-desc" }, "返回给模型的结果条数，clamp 1–10")], -1), J("div", rs, [
					J("input", {
						class: "cs-range",
						type: "range",
						min: B(Bo).min,
						max: B(Bo).max,
						step: B(Bo).step,
						value: e.values.maxResults,
						"aria-label": "结果条数",
						onChange: n[0] ||= (e) => s(e.target.value)
					}, null, 40, is),
					J("input", {
						class: "cs-num",
						type: "number",
						min: B(Bo).min,
						max: B(Bo).max,
						value: e.values.maxResults,
						"aria-label": "结果条数（数字）",
						onChange: n[1] ||= (e) => s(e.target.value)
					}, null, 40, as),
					n[3] ||= J("span", { class: "cs-unit" }, "条", -1),
					n[4] ||= J("span", { class: "cs-row-note" }, "1–10", -1),
					J("span", os, A(e.errors.maxResults || ""), 1)
				])]),
				J("div", ss, [n[6] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "缓存 TTL"), J("div", { class: "cs-row-desc" }, "LRU 50 条；命中缓存不发起网络请求")], -1), J("div", cs, [J("select", {
					class: "cs-select",
					value: e.values.cacheTtlMs,
					"aria-label": "缓存 TTL",
					onChange: n[2] ||= (e) => c(e.target.value)
				}, [(K(!0), q(W, null, dr(B(Vo), (e) => (K(), q("option", {
					key: e.valueMs,
					value: e.valueMs
				}, A(e.label), 9, us))), 128))], 40, ls), J("span", ds, A(e.errors.cacheTtlMs || ""), 1)])])
			]),
			n[9] ||= J("div", { class: "cs-hint" }, [J("span", null, [X("键面与 Config 一一对应："), J("code", null, "timeoutMs / retries / chainBudgetMs / maxResults / cacheTtlMs / egoBudget")])], -1)
		]));
	}
}, ps = [
	"auto",
	"force",
	"off"
], ms = "auto", hs = [
	{
		value: "auto",
		label: "让位优先",
		hint: "profile 显式指定别家 provider 时只警告不接管（默认）",
		scene: "按场景怎么选：想先试插件又不想改变现有习惯 → 选它，随时可回退"
	},
	{
		value: "force",
		label: "强制接管",
		hint: "覆盖别家 provider 强制接管 web_search（需显式选择）",
		scene: "按场景怎么选：确定要插件接管全部 web_search、不再用别家 provider → 选它"
	},
	{
		value: "off",
		label: "禁用接管",
		hint: "不注册 provider、不动指针（K-10 关断态）",
		scene: "按场景怎么选：只想保留设置与缓存、暂时不用本插件搜索 → 选它"
	}
], gs = "隐私提示：出网请求体只含查询词与必要检索参数；vault / 记忆 / 会话上下文不出网；凭据仅以 env 名（credential-ref）引用，不落明文。";
function _s(e) {
	return ps.includes(e) ? e : ms;
}
function vs(e, t) {
	return _s(e) === t;
}
//#endregion
//#region src/components/TakeoverCard.vue
var ys = {
	class: "cs-card",
	"aria-label": "接管与隐私"
}, bs = { class: "cs-rows" }, xs = { class: "cs-row" }, Ss = { class: "cs-row-control" }, Cs = {
	class: "cs-seg",
	role: "radiogroup",
	"aria-label": "接管开关"
}, ws = [
	"aria-checked",
	"title",
	"onClick"
], Ts = {
	class: "cs-sem",
	role: "note",
	"aria-label": "让位语义说明"
}, Es = { class: "cs-sem-name" }, Ds = { class: "cs-sem-body" }, Os = { class: "cs-sem-text" }, ks = { class: "cs-sem-scene" }, As = { class: "cs-tip" }, js = {
	__name: "TakeoverCard",
	props: { takeOver: {
		type: String,
		default: "auto"
	} },
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t;
		function i(e) {
			r("change", { takeOver: e });
		}
		return (e, t) => (K(), q("section", ys, [
			t[2] ||= J("div", { class: "cs-card-head" }, [J("h2", { class: "cs-card-title" }, "接管与隐私"), J("span", { class: "cs-count" }, "默认：让位优先")], -1),
			t[3] ||= J("p", { class: "cs-card-desc" }, " 接管语义（INV-10）：profile 显式指定别家 provider 时只警告不接管，强制需显式开启 ", -1),
			J("div", bs, [J("div", xs, [t[0] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "接管开关"), J("div", { class: "cs-row-desc" }, "与宿主 deepseek-official provider 的让位/接管行为")], -1), J("div", Ss, [J("div", Cs, [(K(!0), q(W, null, dr(B(hs), (e) => (K(), q("button", {
				key: e.value,
				class: k(["cs-seg-item", { "is-active": B(vs)(n.takeOver, e.value) }]),
				type: "button",
				role: "radio",
				"aria-checked": String(B(vs)(n.takeOver, e.value)),
				title: e.hint,
				onClick: (t) => i(e.value)
			}, A(e.label), 11, ws))), 128))])])])]),
			J("div", Ts, [(K(!0), q(W, null, dr(B(hs), (e) => (K(), q("div", {
				key: e.value,
				class: k(["cs-sem-row", { "is-current": B(vs)(n.takeOver, e.value) }])
			}, [J("div", Es, A(e.label), 1), J("div", Ds, [J("p", Os, A(e.hint), 1), J("p", ks, A(e.scene), 1)])], 2))), 128))]),
			J("div", As, [t[1] ||= J("svg", {
				class: "cs-tip-icon",
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				"aria-hidden": "true"
			}, [J("path", {
				d: "M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "1.2"
			})], -1), J("p", null, A(B(gs)), 1)]),
			t[4] ||= J("div", { class: "cs-hint" }, [J("span", null, [
				X("三态映射 Config "),
				J("code", null, "takeOver"),
				X("：auto=让位优先 · force=强制接管 · off=禁用接管")
			])], -1)
		]));
	}
}, Ms = {
	class: "cs-card",
	"aria-label": "诊断"
}, Ns = { class: "cs-card-head" }, Ps = { class: "cs-count" }, Fs = { class: "cs-rows" }, Is = { class: "cs-row" }, Ls = { class: "cs-row-main" }, Rs = { class: "cs-row-desc" }, zs = { class: "cs-check-name" }, Bs = { class: "cs-check-detail" }, Vs = { class: "cs-metrics" }, Hs = { class: "cs-metric" }, Us = { class: "cs-metric-value" }, Ws = { class: "cs-metric" }, Gs = { class: "cs-metric-value" }, Ks = { class: "cs-metric-label" }, qs = { class: "cs-hint" }, Js = { class: "cs-hint-sep" }, Ys = { class: "cs-hint-sep cs-error" }, Xs = {
	__name: "DiagnosticsCard",
	props: { api: {
		type: Object,
		default: null
	} },
	emits: ["open-log"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = /* @__PURE__ */ z("idle"), a = /* @__PURE__ */ z({
			items: [],
			summary: "尚未检查",
			log: {
				available: !0,
				used: 0,
				capacity: 0
			},
			ego: {
				used: 0,
				limit: 0
			},
			stats: []
		}), o = /* @__PURE__ */ z(""), s = /* @__PURE__ */ z("idle"), c = /* @__PURE__ */ z(""), l = /* @__PURE__ */ z("idle"), u = /* @__PURE__ */ z(""), d = Q(() => i.value === "loading" ? "检查中…" : i.value === "error" ? "检查失败" : i.value === "ok" ? a.value.summary : "尚未检查"), f = Q(() => s.value === "loading" ? "真联网测试中…（会真实出网）" : c.value), p = Q(() => l.value === "loading" ? "清空中…" : u.value), m = Q(() => `${a.value.log.used} / ${a.value.log.capacity}`), h = Q(() => `${a.value.ego.used} / ${a.value.ego.limit}`), g = Q(() => a.value.log.available ? "触发日志（进程内存环）" : "日志不可用（内存环写失败，INV-13 如实明示）");
		async function _() {
			if (i.value = "loading", o.value = "", !n.api || typeof n.api.diagnostics != "function") {
				i.value = "error", o.value = "设置读写契约缺位，无法自检（只读展示）";
				return;
			}
			try {
				a.value = await n.api.diagnostics(), i.value = "ok";
			} catch (e) {
				i.value = "error", o.value = e?.message ?? String(e);
			}
		}
		async function v() {
			s.value = "loading", c.value = "";
			try {
				let e = await n.api.onlineTest(), t = Array.isArray(e?.results) ? e.results.filter((e) => e?.ok).length : 0, r = Array.isArray(e?.results) ? e.results.length : 0;
				c.value = `真联网测试完成：${t}/${r} 源返回结果 · 总耗时 ${e?.totalMs ?? "—"}ms${e?.truncated ? " · 未测（超时截断）" : ""}`, s.value = "ok";
			} catch (e) {
				s.value = "error", c.value = e?.message ?? String(e);
			}
		}
		async function y() {
			l.value = "loading", u.value = "";
			try {
				let e = await n.api.clearCache();
				u.value = `已清空结果缓存${typeof e?.cleared == "number" ? `（${e.cleared} 条）` : ""}`, l.value = "ok";
			} catch (e) {
				l.value = "error", u.value = e?.message ?? String(e);
			}
		}
		function b() {
			r("open-log");
		}
		return tr(_), (e, t) => (K(), q("section", Ms, [
			J("div", Ns, [t[0] ||= J("h2", { class: "cs-card-title" }, "诊断", -1), J("span", Ps, A(d.value), 1)]),
			t[4] ||= J("p", { class: "cs-card-desc" }, " 本地自检不出网（Config 可读、源开关、写缝在场、缓存目录可写等）；「真联网测试」须点击触发，默认测试集离线绿（INV-14） ", -1),
			J("div", Fs, [J("div", Is, [J("div", Ls, [t[1] ||= J("div", { class: "cs-row-label" }, "插件自检", -1), J("div", Rs, A(d.value), 1)]), J("div", { class: "cs-row-control" }, [
				J("button", {
					class: "cs-btn-ghost",
					type: "button",
					onClick: _
				}, "重新自检"),
				J("button", {
					class: "cs-btn-ghost",
					type: "button",
					onClick: v
				}, "真联网测试"),
				J("button", {
					class: "cs-btn-tiny",
					type: "button",
					onClick: b
				}, "查看触发日志"),
				J("button", {
					class: "cs-btn-tiny",
					type: "button",
					onClick: y
				}, "手动清缓存")
			])])]),
			J("div", { class: k(["cs-check-list", {
				"is-loading": i.value === "loading",
				"is-error": i.value === "error"
			}]) }, [(K(!0), q(W, null, dr(a.value.items, (e) => (K(), q("div", {
				key: e.id,
				class: "cs-check-row"
			}, [
				J("span", zs, A(e.label), 1),
				J("span", Bs, A(e.detail), 1),
				J("span", { class: k(["cs-check-status", e.status === "pass" ? "is-ok" : "is-fail"]) }, A(e.status === "pass" ? "✓ 正常" : "✗ 失败"), 3)
			]))), 128))], 2),
			J("div", Vs, [
				J("div", Hs, [J("span", Us, A(h.value), 1), t[2] ||= J("span", { class: "cs-metric-label" }, "ego-browser 已用 / 预算（真实计数，INV-20）", -1)]),
				t[3] ||= J("div", { class: "cs-metric" }, [J("span", { class: "cs-metric-value" }, "LRU 50 条"), J("span", { class: "cs-metric-label" }, "结果缓存（条目上限；TTL 见性能预算卡）")], -1),
				J("div", Ws, [J("span", Gs, A(m.value), 1), J("span", Ks, A(g.value), 1)])
			]),
			t[5] ||= J("div", { class: "cs-tip" }, [J("svg", {
				class: "cs-tip-icon",
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				"aria-hidden": "true"
			}, [J("path", {
				d: "M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "1.2"
			})]), J("p", null, [
				X(" 触发日志仅存进程内存环，"),
				J("b", null, "不落盘、重启即清空"),
				X("（INV-11）；「真联网测试」会真实出网请求各搜索源，仅按钮点击触发、不进默认测试集（INV-14）。 ")
			])], -1),
			J("div", qs, [
				J("span", null, A(f.value), 1),
				J("span", Js, A(p.value), 1),
				J("span", Ys, A(o.value), 1)
			])
		]));
	}
}, Zs = (e, t) => {
	let n = e.__vccOpts || e;
	for (let [e, r] of t) n[e] = r;
	return n;
}, Qs = {
	class: "sh-card",
	"aria-label": "源健康测试"
}, $s = { class: "sh-head" }, ec = { class: "sh-count" }, tc = { class: "sh-rows" }, nc = { class: "sh-name" }, rc = { class: "sh-elapsed" }, ic = { class: "sh-detail" }, ac = ["onClick"], oc = { class: "sh-foot" }, sc = { class: "sh-note-sep" }, cc = /*#__PURE__*/ Zs({
	__name: "SourceHealthRow",
	props: {
		api: {
			type: Object,
			default: null
		},
		sources: {
			type: Array,
			default: () => co.map((e) => ({
				id: e,
				label: lo[e]
			}))
		}
	},
	setup(e) {
		let t = e, n = /* @__PURE__ */ P({}), r = /* @__PURE__ */ P({
			phase: "idle",
			text: "",
			truncated: !1
		}), i = /* @__PURE__ */ P({
			text: "",
			error: !1
		});
		function a(e) {
			return n[e] || (n[e] = {
				phase: "idle",
				ok: !1,
				elapsedMs: null,
				detail: "",
				count: null
			}), n[e];
		}
		let o = Q(() => r.phase === "loading" ? "真联网测试中…（10s 总上限，会真实出网）" : r.text);
		function s(e) {
			return e.phase === "loading" ? "测试中…" : e.phase === "idle" ? "未测" : e.ok ? "✓ 成功" : "✗ 失败";
		}
		function c(e) {
			return e.phase === "ok" ? e.ok ? "is-ok" : "is-fail" : e.phase === "error" ? "is-fail" : "is-idle";
		}
		function l(e) {
			return e.elapsedMs == null ? "—" : `${e.elapsedMs}ms`;
		}
		async function u() {
			if (t.api && typeof t.api.diagnostics == "function") try {
				let e = await t.api.diagnostics();
				for (let t of e?.stats ?? []) {
					let e = a(t.name);
					e.phase === "idle" && (e.elapsedMs = t.lastMs, e.ok = t.lastOk === !0, e.detail = `近 ${t.count} 次 · ${t.okCount} 成功`, e.count = t.count);
				}
				i.text = "最近耗时/成败来自触发日志统计（重启即归零）", i.error = !1;
			} catch (e) {
				i.text = e?.message ?? String(e), i.error = !0;
			}
		}
		async function d(e) {
			let n = a(e);
			n.phase = "loading";
			try {
				let r = await t.api.probe(e);
				n.ok = r?.ok === !0, n.elapsedMs = r?.elapsedMs ?? null, n.count = r?.resultCount ?? null, n.detail = r?.detail ?? "", n.phase = "ok";
			} catch (e) {
				n.phase = "error", n.ok = !1, n.detail = e?.message ?? String(e);
			}
		}
		async function f() {
			r.phase = "loading", r.text = "", r.truncated = !1;
			try {
				let e = await t.api.onlineTest();
				for (let t of e?.results ?? []) {
					let e = a(t.source);
					e.phase = "ok", e.ok = t.ok === !0, e.elapsedMs = t.elapsedMs ?? null, e.count = t.resultCount ?? null, e.detail = t.detail ?? "";
				}
				r.truncated = e?.truncated === !0, r.text = `真联网测试完成：${(e?.results ?? []).filter((e) => e?.ok).length}/${(e?.results ?? []).length} 源返回结果 · 总耗时 ${e?.totalMs ?? "—"}ms · 预算 ${e?.budgetMs ?? "—"}ms`, r.phase = "ok";
			} catch (e) {
				r.phase = "error", r.text = e?.message ?? String(e);
			}
		}
		return tr(u), (e, n) => (K(), q("section", Qs, [
			J("div", $s, [n[0] ||= J("h2", { class: "sh-title" }, "源健康测试", -1), J("span", ec, A(o.value), 1)]),
			n[1] ||= J("p", { class: "sh-desc" }, " 单源探针：绕过缓存与 guard，只测该源真实可达与耗时（超时 5s，R23）；「真联网测试」总上限 10s（R30），超时源如实标「未测（超时截断）」。真联网仅按钮点击触发（INV-14），不进默认测试集。 ", -1),
			J("div", tc, [(K(!0), q(W, null, dr(t.sources, (e) => (K(), q("div", {
				key: e.id,
				class: "sh-row"
			}, [
				J("span", nc, A(e.label), 1),
				J("span", { class: k(["sh-status", c(a(e.id))]) }, A(s(a(e.id))), 3),
				J("span", rc, A(l(a(e.id))), 1),
				J("span", ic, A(a(e.id).detail), 1),
				J("button", {
					class: "sh-btn",
					type: "button",
					onClick: (t) => d(e.id)
				}, "测试", 8, ac)
			]))), 128))]),
			J("div", oc, [J("button", {
				class: "sh-btn-wide",
				type: "button",
				onClick: f
			}, "真联网测试"), J("span", { class: k(["sh-note", { "is-error": i.error }]) }, [X(A(i.text), 1), J("span", sc, A(r.truncated ? "未测（超时截断）：部分源超出 10s 总上限未及测试" : ""), 1)], 2)])
		]));
	}
}, [["__scopeId", "data-v-302b100e"]]), lc = {
	class: "lm-scrim",
	role: "dialog",
	"aria-modal": "true",
	"aria-label": "触发日志"
}, uc = { class: "lm-modal" }, dc = { class: "lm-head" }, fc = { class: "lm-head-right" }, pc = { class: "lm-capacity" }, mc = { class: "lm-body" }, hc = { class: "lm-time" }, gc = { class: "lm-query" }, _c = { class: "lm-src" }, vc = { class: "lm-count" }, yc = { class: "lm-ms" }, bc = { class: "lm-empty-sep" }, xc = { class: "lm-foot" }, Sc = { class: "lm-note" }, Cc = /*#__PURE__*/ Zs({
	__name: "LogModal",
	props: {
		api: {
			type: Object,
			default: null
		},
		open: {
			type: Boolean,
			default: !1
		}
	},
	emits: ["close"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = /* @__PURE__ */ z("idle"), a = /* @__PURE__ */ z([]), o = /* @__PURE__ */ z(0), s = /* @__PURE__ */ P({
			code: "",
			message: "",
			hint: ""
		}), c = /* @__PURE__ */ P({
			phase: "idle",
			text: ""
		}), l = Q(() => `${a.value.length} / ${o.value} 条`), u = Q(() => a.value.slice(-50)), d = Q(() => i.value === "loading" ? "加载中…" : i.value === "error" ? s.code === "logs_unavailable" ? "日志不可用（503 logs_unavailable，内存环写失败）" : s.message || "日志读取失败" : i.value === "ok" ? `尾部 ${u.value.length} 行 · 按时间倒序` : "尚未加载"), f = Q(() => c.phase === "loading" ? "清空中…" : c.text);
		function p(e) {
			let t = e?.queryDigest ?? {};
			return `查询「${t.first ?? "—"}…」${t.len ?? 0} 字`;
		}
		function m(e) {
			return (e?.sources ?? []).map((e) => e?.name ?? "—").join(" / ");
		}
		function h(e) {
			return new Date(Number(e) || 0).toTimeString().slice(0, 8);
		}
		function g(e) {
			return e?.elapsedMs == null ? "—" : `${e.elapsedMs}ms`;
		}
		async function _() {
			if (i.value = "loading", s.code = "", s.message = "", s.hint = "", !n.api || typeof n.api.logs != "function") {
				i.value = "error", s.message = "设置读写契约缺位，无法读取日志", s.hint = "请检查插件 API 注入后点击「重试」";
				return;
			}
			try {
				let e = await n.api.logs();
				a.value = Array.isArray(e?.entries) ? e.entries : [], o.value = e?.capacity ?? 0, i.value = "ok";
			} catch (e) {
				i.value = "error", s.code = e?.code ?? "", s.message = e?.message ?? String(e), s.hint = e?.hint ?? "请重试；重启后自愈（INV-13 如实明示，不粉饰）";
			}
		}
		async function v() {
			c.phase = "loading", c.text = "";
			try {
				let e = await n.api.clearLogs();
				c.text = `已清空内存环${typeof e?.cleared == "number" ? `（${e.cleared} 条）` : ""}`, c.phase = "ok", await _();
			} catch (e) {
				c.phase = "error", c.text = e?.message ?? String(e);
			}
		}
		function y() {
			r("close");
		}
		return jn(() => n.open, (e) => {
			e && _();
		}), (e, t) => Tn((K(), q("div", lc, [J("div", uc, [
			J("div", dc, [t[0] ||= J("span", { class: "lm-title" }, "触发日志", -1), J("div", fc, [J("span", pc, A(l.value), 1), J("button", {
				class: "lm-close",
				type: "button",
				"aria-label": "关闭",
				onClick: y
			}, "✕")])]),
			t[1] ||= J("div", { class: "lm-tip" }, [J("svg", {
				class: "lm-tip-icon",
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				"aria-hidden": "true"
			}, [J("path", {
				d: "M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "1.2"
			})]), J("p", null, [
				X(" 仅存进程内存环（超出丢最旧），"),
				J("b", null, "不落盘、重启即清空"),
				X("（INV-11）；条目只记脱敏摘要（长度 + 首词），不含完整查询词与响应正文（INV-12）。 ")
			])], -1),
			J("div", mc, [(K(!0), q(W, null, dr(u.value, (e, t) => (K(), q("div", {
				key: `${e.ts}-${t}`,
				class: "lm-row"
			}, [
				J("span", hc, A(h(e.ts)), 1),
				J("span", gc, A(p(e)), 1),
				J("span", _c, A(m(e)), 1),
				J("span", vc, A(e.resultCount ?? 0) + " 条", 1),
				J("span", yc, A(g(e)), 1),
				J("span", { class: k(["lm-status", e.ok ? "is-ok" : "is-fail"]) }, A(e.ok ? "✓ 成功" : "✗ 失败"), 3)
			]))), 128)), J("div", { class: k(["lm-empty", { "is-error": i.value === "error" }]) }, [
				J("span", null, A(d.value), 1),
				J("span", bc, A(s.hint), 1),
				J("button", {
					class: "lm-btn",
					type: "button",
					onClick: _
				}, "重试")
			], 2)]),
			J("div", xc, [J("button", {
				class: "lm-btn-wide",
				type: "button",
				onClick: v
			}, "清空日志"), J("span", Sc, A(f.value), 1)])
		])], 512)), [[ba, n.open]]);
	}
}, [["__scopeId", "data-v-d285040a"]]), wc = "tag / .class / #id / [attr] / [attr=\"value\"] / 后代（空格）/ 子代（>）/ 逗号并列";
function $(e) {
	return Object.assign(/* @__PURE__ */ Error(`选择器不受支持：${e}。支持的子集：${wc}`), { code: "SELECTOR_UNSUPPORTED" });
}
var Tc = /* @__PURE__ */ RegExp("^-?[_a-zA-Z][_a-zA-Z0-9-]*");
function Ec(e) {
	let t = [], n = "", r = 0, i = null;
	for (let a of e) {
		if (i) {
			n += a, a === i && (i = null);
			continue;
		}
		if (a === "\"" || a === "'") {
			i = a, n += a;
			continue;
		}
		if (a === "[" && (r += 1), a === "]" && --r, a === "," && r === 0) {
			t.push(n), n = "";
			continue;
		}
		n += a;
	}
	return t.push(n), t;
}
function Dc(e) {
	let t = {
		tag: null,
		id: null,
		classes: [],
		attrs: []
	}, n = e, r = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(n);
	for (r && (t.tag = r[0].toLowerCase(), n = n.slice(r[0].length)); n.length > 0;) {
		let r = n[0];
		if (r === "#" || r === ".") {
			let i = Tc.exec(n.slice(1));
			if (!i) throw $(`标识符非法：${e}`);
			if (r === "#") {
				if (t.id !== null) throw $(`多个 #id：${e}`);
				t.id = i[0];
			} else t.classes.push(i[0]);
			n = n.slice(1 + i[0].length);
			continue;
		}
		if (r === "[") {
			let r = n.indexOf("]");
			if (r < 0) throw $(`方括号未闭合：${e}`);
			let i = n.slice(1, r);
			n = n.slice(r + 1);
			let a = i.indexOf("=");
			if (a < 0) {
				let n = i.trim().toLowerCase();
				if (!/^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(n)) throw $(`属性名非法：${e}`);
				t.attrs.push({
					name: n,
					op: "presence",
					value: null
				});
				continue;
			}
			let o = i.slice(0, a).trim().toLowerCase(), s = i.slice(a + 1).trim();
			if (!/^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(o)) throw $(`属性名非法：${e}`);
			let c = s;
			if (s.startsWith("\"") && s.endsWith("\"") && s.length >= 2 || s.startsWith("'") && s.endsWith("'") && s.length >= 2) c = s.slice(1, -1);
			else if (s === "" || /[\s\]"'^$*|~]/.test(s)) throw $(`属性运算符或取值不受支持（只支持 [attr] 与 [attr="value"]）：${e}`);
			t.attrs.push({
				name: o,
				op: "exact",
				value: c
			});
			continue;
		}
		throw $(r === ":" ? `伪类/伪元素不支持：${e}` : r === "*" ? `通配 * 不支持：${e}` : `无法解析的片段：${n}`);
	}
	return t;
}
function Oc(e) {
	let t = e.trim();
	if (t === "") throw $("空选择器");
	let n = [], r = "", i = 0, a = null, o = !1, s = () => {
		r !== "" && (n.push({
			type: "compound",
			text: r
		}), r = "");
	};
	for (let e of t) {
		if (a) {
			r += e, e === a && (a = null);
			continue;
		}
		if (e === "\"" || e === "'") {
			a = e, r += e;
			continue;
		}
		if (e === "[" && (i += 1), e === "]" && --i, i === 0 && (e === "+" || e === "~")) throw $(`兄弟组合器（${e}）不支持，只支持空格（后代）与 >（子代）`);
		if (i === 0 && e === ">") {
			s(), o = !1, n.push({
				type: "combinator",
				value: "child"
			});
			continue;
		}
		if (i === 0 && /\s/.test(e)) {
			r !== "" && (o = !0), s();
			continue;
		}
		o && n.length > 0 && n[n.length - 1].type === "compound" && n.push({
			type: "combinator",
			value: "descendant"
		}), o = !1, r += e;
	}
	if (s(), n.length === 0) throw $("空选择器");
	if (n.length % 2 == 0) throw $(`组合器收尾（悬空组合器）：${t}`);
	let c = [];
	for (let e = 0; e < n.length; e += 1) {
		let r = n[e], i = e % 2 == 0;
		if (r.type !== (i ? "compound" : "combinator")) throw $(`组合器位置非法（连续/打头/收尾均不支持）：${t}`);
		i ? c.push({
			compound: Dc(r.text),
			combinatorToNext: null
		}) : c[c.length - 1].combinatorToNext = r.value;
	}
	return c;
}
function kc(e) {
	if (typeof e != "string") throw $("选择器必须是字符串");
	let t = e.trim();
	if (t === "") throw $("空选择器");
	return Ec(t).map(Oc);
}
function Ac(e) {
	try {
		return kc(e), {
			ok: !0,
			errors: []
		};
	} catch (e) {
		return {
			ok: !1,
			errors: [e && e.message ? e.message : "选择器不受支持"]
		};
	}
}
//#endregion
//#region src/components/CustomSourceCard.vue
var jc = {
	class: "cs-card",
	"aria-label": "自定义源"
}, Mc = { class: "cs-card-head" }, Nc = { class: "cs-row-control" }, Pc = { class: "cs-count" }, Fc = { class: "cs-rows" }, Ic = { class: "cs-order" }, Lc = { class: "cs-row-main" }, Rc = { class: "cs-row-label" }, zc = { class: "cs-row-desc" }, Bc = { class: "cs-row-control" }, Vc = ["onClick"], Hc = ["onClick"], Uc = { class: "cc-form" }, Wc = { class: "cc-field" }, Gc = { class: "cc-field" }, Kc = { class: "cc-field" }, qc = { class: "cc-field" }, Jc = { class: "cc-field" }, Yc = { class: "cc-guide" }, Xc = { class: "cc-foot" }, Zc = { class: "cs-row-control" }, Qc = "{query}", $c = /*#__PURE__*/ Zs({
	__name: "CustomSourceCard",
	props: {
		custom: {
			type: Array,
			default: () => []
		},
		priority: {
			type: Array,
			default: () => []
		}
	},
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = /* @__PURE__ */ z(!1), a = /* @__PURE__ */ z(""), o = /* @__PURE__ */ P({
			label: "",
			urlTemplate: "",
			itemSelector: "",
			titleSelector: "",
			linkSelector: ""
		}), s = /* @__PURE__ */ P({
			text: "",
			error: !1
		});
		function c(e) {
			let t = String(e ?? "");
			if (t === "") return {
				ok: !1,
				text: "必填：URL 模板"
			};
			if (!t.startsWith("https://")) return {
				ok: !1,
				text: "✗ 必须 https 起头（INV-15 禁 http 明文）"
			};
			if (!t.includes(Qc)) return {
				ok: !1,
				text: `✗ 缺 ${Qc} 占位（查询词唯一入口，K-4）`
			};
			let n = "";
			try {
				n = new URL(t).hostname;
			} catch {
				return {
					ok: !1,
					text: "✗ URL 不合法"
				};
			}
			return n === "localhost" || /^127\./.test(n) || /^10\./.test(n) || /^192\.168\./.test(n) || /^172\.(1[6-9]|2\d|3[01])\./.test(n) || /^169\.254\./.test(n) || n === "::1" || n === "[::1]" || n.endsWith(".local") ? {
				ok: !1,
				text: "✗ 拒绝：内网 / 回环 / 链路本地地址（169.254.169.254 等）"
			} : {
				ok: !0,
				text: "✓ https 校验通过 · 非内网地址 · {query} 占位在位"
			};
		}
		function l(e) {
			let t = String(e ?? "");
			if (t === "") return {
				ok: !1,
				text: "必填：选择器"
			};
			let n = Ac(t);
			return n.ok ? {
				ok: !0,
				text: "✓ 语法受支持（本地解析用）"
			} : {
				ok: !1,
				text: `✗ ${n.errors[0] ?? "选择器不受支持"}`
			};
		}
		let u = Q(() => c(o.urlTemplate)), d = Q(() => l(o.itemSelector)), f = Q(() => l(o.titleSelector)), p = Q(() => l(o.linkSelector)), m = Q(() => o.label.trim() !== "" && u.value.ok && d.value.ok && f.value.ok && p.value.ok), h = Q(() => i.value ? "收起" : a.value ? "编辑中…" : "+ 添加自定义源");
		function g(e) {
			let t = n.priority.indexOf(e);
			return t < 0 ? "—" : String(t + 1);
		}
		function _(e) {
			return `${e.itemSelector} → ${e.titleSelector} / ${e.linkSelector}`;
		}
		function v() {
			o.label = "", o.urlTemplate = "", o.itemSelector = "", o.titleSelector = "", o.linkSelector = "", a.value = "";
		}
		function y() {
			i.value = !i.value, i.value || v(), s.text = "";
		}
		function b(e) {
			o.label = e.label ?? "", o.urlTemplate = e.urlTemplate ?? "", o.itemSelector = e.itemSelector ?? "", o.titleSelector = e.titleSelector ?? "", o.linkSelector = e.linkSelector ?? "", a.value = e.id, i.value = !0, s.text = "";
		}
		function x(e) {
			r("change", { custom: n.custom.filter((t) => t.id !== e) }), s.text = "已删除该自定义源（保存后生效）", s.error = !1;
		}
		function S() {
			if (!m.value) {
				s.text = "✗ 请先修正表单中的校验错误（保存前仍会复检出站门禁，K-16）", s.error = !0;
				return;
			}
			let e = {
				id: a.value || `custom-${Date.now().toString(36)}`,
				label: o.label.trim(),
				urlTemplate: o.urlTemplate.trim(),
				itemSelector: o.itemSelector.trim(),
				titleSelector: o.titleSelector.trim(),
				linkSelector: o.linkSelector.trim()
			}, t = a.value ? n.custom.map((t) => t.id === a.value ? e : t) : [...n.custom, e];
			r("change", { custom: t }), s.text = a.value ? "✓ 已更新（保存后生效）" : "✓ 已添加（保存后生效）", s.error = !1, v(), i.value = !1;
		}
		return (e, t) => (K(), q("section", jc, [
			J("div", Mc, [t[5] ||= J("h2", { class: "cs-card-title" }, "自定义源", -1), J("div", Nc, [J("span", Pc, A(n.custom.length) + " 个自定义源", 1), J("button", {
				class: "cs-btn-ghost",
				type: "button",
				onClick: y
			}, A(h.value), 1)])]),
			t[18] ||= J("p", { class: "cs-card-desc" }, " 与内置四源混排统一排序（序号 = 优先级链位置，R25）；新增/编辑走下方行内表单，逐字段带填写引导（R7） ", -1),
			J("div", Fc, [(K(!0), q(W, null, dr(n.custom, (e) => (K(), q("div", {
				key: e.id,
				class: "cs-row"
			}, [
				J("span", Ic, A(g(e.id)), 1),
				J("div", Lc, [J("div", Rc, [X(A(e.label) + " ", 1), t[6] ||= J("span", { class: "cc-badge" }, "自定义", -1)]), J("div", zc, [J("code", null, A(e.urlTemplate), 1), X(" · " + A(_(e)), 1)])]),
				J("div", Bc, [J("button", {
					class: "cs-btn-tiny",
					type: "button",
					onClick: (t) => b(e)
				}, "编辑", 8, Vc), J("button", {
					class: "cs-btn-tiny cc-danger",
					type: "button",
					onClick: (t) => x(e.id)
				}, "删除", 8, Hc)])
			]))), 128))]),
			Tn(J("div", Uc, [
				J("div", Wc, [
					t[7] ||= J("div", { class: "cc-label" }, [X("名称 "), J("span", { class: "cc-req" }, "必填")], -1),
					t[8] ||= J("div", { class: "cc-hint" }, "源列表里显示的名字，例如「我的示例源」", -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[0] ||= (e) => o.label = e,
						class: "cc-input",
						type: "text",
						placeholder: "我的示例源"
					}, null, 512), [[to, o.label]])
				]),
				J("div", Gc, [
					t[9] ||= J("div", { class: "cc-label" }, [X("URL 模板 "), J("span", { class: "cc-req" }, "必填")], -1),
					t[10] ||= J("div", { class: "cc-hint" }, [
						X(" 查询词用 "),
						J("code", null, A("{query}")),
						X(" 占位，例如 "),
						J("code", null, "https://search.example.com/?q={query}"),
						X("； 必须 https 起头，禁止内网 / 回环 / 169.254.169.254 ")
					], -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[1] ||= (e) => o.urlTemplate = e,
						class: "cc-input",
						type: "text",
						placeholder: "https://search.example.com/?q={query}"
					}, null, 512), [[to, o.urlTemplate]]),
					J("div", { class: k(["cc-feedback", u.value.ok ? "is-ok" : "is-fail"]) }, A(u.value.text), 3)
				]),
				J("div", Kc, [
					t[11] ||= J("div", { class: "cc-label" }, [X("结果项选择器 "), J("span", { class: "cc-req" }, "必填")], -1),
					t[12] ||= J("div", { class: "cc-hint" }, [
						X("每条结果的容器元素，例如 "),
						J("code", null, ".result-item"),
						X("；仅用于本地解析，不进请求（K-17）")
					], -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[2] ||= (e) => o.itemSelector = e,
						class: "cc-input",
						type: "text",
						placeholder: ".result-item"
					}, null, 512), [[to, o.itemSelector]]),
					J("div", { class: k(["cc-feedback", d.value.ok ? "is-ok" : "is-fail"]) }, A(d.value.text), 3)
				]),
				J("div", qc, [
					t[13] ||= J("div", { class: "cc-label" }, [X("标题选择器 "), J("span", { class: "cc-req" }, "必填")], -1),
					t[14] ||= J("div", { class: "cc-hint" }, [
						X("结果容器内的标题元素，例如 "),
						J("code", null, "h3 a"),
						X("，取其文本")
					], -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[3] ||= (e) => o.titleSelector = e,
						class: "cc-input",
						type: "text",
						placeholder: "h3 a"
					}, null, 512), [[to, o.titleSelector]]),
					J("div", { class: k(["cc-feedback", f.value.ok ? "is-ok" : "is-fail"]) }, A(f.value.text), 3)
				]),
				J("div", Jc, [
					t[15] ||= J("div", { class: "cc-label" }, [X("链接选择器 "), J("span", { class: "cc-req" }, "必填")], -1),
					t[16] ||= J("div", { class: "cc-hint" }, [
						X("结果容器内的链接元素，例如 "),
						J("code", null, "h3 a"),
						X("，取其 href（必须 http(s) 绝对地址）")
					], -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[4] ||= (e) => o.linkSelector = e,
						class: "cc-input",
						type: "text",
						placeholder: "h3 a"
					}, null, 512), [[to, o.linkSelector]]),
					J("div", { class: k(["cc-feedback", p.value.ok ? "is-ok" : "is-fail"]) }, A(p.value.text), 3)
				]),
				J("div", Yc, [t[17] ||= X(" 选择器支持的子集（超集一律拒绝，fail-closed 不降级）：", -1), J("code", null, A(B(wc)), 1)]),
				J("div", Xc, [J("div", { class: k(["cc-feedback", s.error ? "is-fail" : "is-ok"]) }, A(s.text), 3), J("div", Zc, [J("button", {
					class: "cs-btn-tiny",
					type: "button",
					onClick: y
				}, "取消"), J("button", {
					class: "cs-btn-primary",
					type: "button",
					onClick: S
				}, A(a.value ? "保存修改" : "添加源"), 1)])])
			], 512), [[ba, i.value]]),
			t[19] ||= J("div", { class: "cs-hint" }, [J("span", null, [
				X("填写引导（R7）：URL 模板必须含 "),
				J("code", null, "{query}"),
				X(" 占位；必须 https 起头，禁止内网 / 回环 / 169.254.169.254；选择器仅用于本地解析，不拼进出网 URL 或请求头。保存前出站门禁复检不可绕过（K-16）。")
			])], -1)
		]));
	}
}, [["__scopeId", "data-v-6eefbe9e"]]), el = {
	class: "cs-card",
	"aria-label": "代理配置"
}, tl = { class: "cs-card-head" }, nl = { class: "cs-row-control" }, rl = { class: "cs-count" }, il = { class: "cs-rows" }, al = { class: "cs-row-main" }, ol = { class: "cs-row-label" }, sl = { class: "cs-row-desc" }, cl = { class: "cs-row-control" }, ll = ["onClick"], ul = ["onClick"], dl = { class: "pc-form" }, fl = { class: "pc-field" }, pl = { class: "pc-field" }, ml = { class: "pc-foot" }, hl = { class: "cs-row-control" }, gl = { class: "cs-rows" }, _l = { class: "cs-row" }, vl = { class: "cs-row-control" }, yl = ["aria-checked"], bl = { class: "cs-row" }, xl = { class: "cs-row-control" }, Sl = ["aria-checked"], Cl = { class: "cs-row" }, wl = { class: "cs-row-control" }, Tl = ["aria-checked"], El = { class: "cs-row" }, Dl = { class: "cs-row-control" }, Ol = ["aria-checked"], kl = { class: "cs-row-main" }, Al = { class: "cs-row-label" }, jl = { class: "cs-row-control" }, Ml = [
	"aria-checked",
	"aria-label",
	"onClick"
], Nl = { class: "cs-hint cs-error" }, Pl = /*#__PURE__*/ Zs({
	__name: "ProxyCard",
	props: {
		proxies: {
			type: Array,
			default: () => []
		},
		useProxy: {
			type: Object,
			default: () => ({})
		},
		custom: {
			type: Array,
			default: () => []
		}
	},
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = /* @__PURE__ */ z(!1), a = /* @__PURE__ */ z(""), o = /* @__PURE__ */ P({
			label: "",
			address: ""
		}), s = /* @__PURE__ */ P({
			text: "",
			error: !1
		});
		function c(e) {
			let t = String(e ?? "");
			return t === "" ? {
				ok: !1,
				text: "必填：代理地址"
			} : t.includes("@") ? {
				ok: !1,
				text: "✗ 本插件不支持代理认证（INV-18：地址禁 user:pass@ 形态）"
			} : /^(?:https?:\/\/)?[A-Za-z0-9.-]+:\d{1,5}$/.test(t) ? {
				ok: !0,
				text: "✓ 地址合法 · CONNECT 隧道 · 不支持认证"
			} : {
				ok: !1,
				text: "✗ 形如 host:port 或 http://host:port（例 192.168.0.41:7890）"
			};
		}
		let l = Q(() => c(o.address)), u = Q(() => o.label.trim() !== "" && l.value.ok), d = Q(() => i.value ? "收起" : a.value ? "编辑中…" : "+ 添加代理"), f = Q(() => [
			"ddg",
			"bing",
			"so360",
			"baidu"
		].filter((e) => n.useProxy[e] === !0).length + n.custom.filter((e) => e?.useProxy === !0).length), p = Q(() => n.proxies.length === 0 && f.value > 0 ? "✗ 已勾选走代理但代理池为空——请添加代理或取消勾选（明示错误，不静默回落直连）" : ""), m = Q(() => `${n.proxies.length} 套代理 · ${f.value} 源走代理`);
		function h() {
			o.label = "", o.address = "", a.value = "";
		}
		function g() {
			i.value = !i.value, i.value || h(), s.text = "";
		}
		function _(e) {
			o.label = e.label ?? "", o.address = e.address ?? "", a.value = e.id, i.value = !0, s.text = "";
		}
		function v(e) {
			r("change", { proxies: n.proxies.filter((t) => t.id !== e) }), s.text = "已删除该代理（保存后生效）", s.error = !1;
		}
		function y() {
			if (!u.value) {
				s.text = "✗ 请先修正地址校验错误（凭据形态与畸形地址均拒收）", s.error = !0;
				return;
			}
			let e = {
				id: a.value || `proxy-${Date.now().toString(36)}`,
				label: o.label.trim(),
				address: o.address.trim()
			};
			r("change", { proxies: a.value ? n.proxies.map((t) => t.id === a.value ? e : t) : [...n.proxies, e] }), s.text = a.value ? "✓ 已更新（保存后生效）" : "✓ 已添加（保存后生效）", s.error = !1, h(), i.value = !1;
		}
		function b(e) {
			r("change", { useProxy: {
				...n.useProxy,
				[e]: n.useProxy[e] !== !0
			} });
		}
		function x(e) {
			r("change", { custom: n.custom.map((t) => t.id === e ? {
				...t,
				useProxy: t.useProxy !== !0
			} : t) });
		}
		return (e, t) => (K(), q("section", el, [
			J("div", tl, [t[6] ||= J("h2", { class: "cs-card-title" }, "代理配置", -1), J("div", nl, [J("span", rl, A(m.value), 1), J("button", {
				class: "cs-btn-ghost",
				type: "button",
				onClick: g
			}, A(d.value), 1)])]),
			t[22] ||= J("p", { class: "cs-card-desc" }, [
				X(" 多套代理地址维护（R17），走 CONNECT 隧道；"),
				J("b", null, "本插件不支持代理认证"),
				X("（地址禁 user:pass@ 形态，INV-18/R20）； 境外源（DuckDuckGo/Bing）默认走代理、国内源（360/百度）与自定义源默认直连（R21） ")
			], -1),
			J("div", il, [(K(!0), q(W, null, dr(n.proxies, (e) => (K(), q("div", {
				key: e.id,
				class: "cs-row"
			}, [J("div", al, [J("div", ol, A(e.label), 1), J("div", sl, [J("code", null, A(e.address), 1), t[7] ||= X(" · CONNECT 隧道 · 不支持认证", -1)])]), J("div", cl, [J("button", {
				class: "cs-btn-tiny",
				type: "button",
				onClick: (t) => _(e)
			}, "编辑", 8, ll), J("button", {
				class: "cs-btn-tiny pc-danger",
				type: "button",
				onClick: (t) => v(e.id)
			}, "删除", 8, ul)])]))), 128))]),
			Tn(J("div", dl, [
				J("div", fl, [t[8] ||= J("div", { class: "pc-label" }, [X("名称 "), J("span", { class: "pc-req" }, "必填")], -1), Tn(J("input", {
					"onUpdate:modelValue": t[0] ||= (e) => o.label = e,
					class: "pc-input",
					type: "text",
					placeholder: "家庭代理"
				}, null, 512), [[to, o.label]])]),
				J("div", pl, [
					t[9] ||= J("div", { class: "pc-label" }, [X("代理地址 "), J("span", { class: "pc-req" }, "必填")], -1),
					t[10] ||= J("div", { class: "pc-hint" }, [
						X("形如 "),
						J("code", null, "host:port"),
						X(" 或 "),
						J("code", null, "http://host:port"),
						X("；本插件不支持代理认证")
					], -1),
					Tn(J("input", {
						"onUpdate:modelValue": t[1] ||= (e) => o.address = e,
						class: "pc-input",
						type: "text",
						placeholder: "192.168.0.41:7890"
					}, null, 512), [[to, o.address]]),
					J("div", { class: k(["pc-feedback", l.value.ok ? "is-ok" : "is-fail"]) }, A(l.value.text), 3)
				]),
				J("div", ml, [J("div", { class: k(["pc-feedback", s.error ? "is-fail" : "is-ok"]) }, A(s.text), 3), J("div", hl, [J("button", {
					class: "cs-btn-tiny",
					type: "button",
					onClick: g
				}, "取消"), J("button", {
					class: "cs-btn-primary",
					type: "button",
					onClick: y
				}, A(a.value ? "保存修改" : "添加代理"), 1)])])
			], 512), [[ba, i.value]]),
			J("div", gl, [
				t[21] ||= J("div", { class: "cs-row" }, [J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "每源映射"), J("div", { class: "cs-row-desc" }, "逐源独立勾选是否走代理（R17）；当前口径=池首项主力，逐源「走哪套」（proxyId）留 backlog（INV-19 不自扩键）")])], -1),
				J("div", _l, [t[12] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "DuckDuckGo"), J("div", { class: "cs-row-desc" }, "境外源 · 默认走代理")], -1), J("div", vl, [J("button", {
					class: k(["cs-switch", { "is-off": n.useProxy.ddg !== !0 }]),
					type: "button",
					role: "switch",
					"aria-checked": String(n.useProxy.ddg === !0),
					"aria-label": "DuckDuckGo 走代理",
					onClick: t[2] ||= (e) => b("ddg")
				}, [...t[11] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, yl)])]),
				J("div", bl, [t[14] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "Bing"), J("div", { class: "cs-row-desc" }, "境外源 · 默认走代理")], -1), J("div", xl, [J("button", {
					class: k(["cs-switch", { "is-off": n.useProxy.bing !== !0 }]),
					type: "button",
					role: "switch",
					"aria-checked": String(n.useProxy.bing === !0),
					"aria-label": "Bing 走代理",
					onClick: t[3] ||= (e) => b("bing")
				}, [...t[13] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, Sl)])]),
				J("div", Cl, [t[16] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "360 搜索"), J("div", { class: "cs-row-desc" }, "国内源 · 默认直连")], -1), J("div", wl, [J("button", {
					class: k(["cs-switch", { "is-off": n.useProxy.so360 !== !0 }]),
					type: "button",
					role: "switch",
					"aria-checked": String(n.useProxy.so360 === !0),
					"aria-label": "360 搜索 走代理",
					onClick: t[4] ||= (e) => b("so360")
				}, [...t[15] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, Tl)])]),
				J("div", El, [t[18] ||= J("div", { class: "cs-row-main" }, [J("div", { class: "cs-row-label" }, "百度"), J("div", { class: "cs-row-desc" }, "国内源 · 默认直连")], -1), J("div", Dl, [J("button", {
					class: k(["cs-switch", { "is-off": n.useProxy.baidu !== !0 }]),
					type: "button",
					role: "switch",
					"aria-checked": String(n.useProxy.baidu === !0),
					"aria-label": "百度 走代理",
					onClick: t[5] ||= (e) => b("baidu")
				}, [...t[17] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, Ol)])]),
				(K(!0), q(W, null, dr(n.custom, (e) => (K(), q("div", {
					key: e.id,
					class: "cs-row"
				}, [J("div", kl, [J("div", Al, A(e.label), 1), t[19] ||= J("div", { class: "cs-row-desc" }, "自定义源 · 默认直连", -1)]), J("div", jl, [J("button", {
					class: k(["cs-switch", { "is-off": e.useProxy !== !0 }]),
					type: "button",
					role: "switch",
					"aria-checked": String(e.useProxy === !0),
					"aria-label": `${e.label} 走代理`,
					onClick: (t) => x(e.id)
				}, [...t[20] ||= [J("span", { class: "cs-thumb" }, null, -1)]], 10, Ml)])]))), 128))
			]),
			J("div", Nl, A(p.value), 1),
			t[23] ||= J("div", { class: "cs-hint" }, [J("span", null, "勾选走代理即经 CONNECT 隧道出站（socket 面收敛在唯一出网缝）；池为空时明示错误不静默回落。代理可达性校验须显式点击触发（K-15，端点面留后续卡）。")], -1)
		]));
	}
}, [["__scopeId", "data-v-107f8058"]]), Fl = Object.freeze({
	sources: { ...fo },
	priority: [...co],
	...No,
	takeOver: ms,
	...Io
}), Il = 8e3, Ll = Object.freeze({
	logs_unavailable: "日志不可用：内存环写失败——请重试；重启后自愈（INV-13 明示，不粉饰）",
	bad_request: "请检查填写项后重试",
	unauthorized: "请刷新页面重试鉴权",
	write_unavailable: "本部署暂只读：配置写缝缺位，可改 profile 配置后重启生效",
	default: "请稍后重试；若持续失败请在诊断卡运行自检定位"
});
function Rl(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.sources && typeof t.sources == "object" ? t.sources : {}, r = { ...fo };
	for (let e of co) typeof n[e] == "boolean" && (r[e] = n[e]);
	let i = Array.isArray(n.priority) ? n.priority : t.priority, a = {
		sources: r,
		priority: Array.isArray(i) && po(i).ok ? [...i] : [...co]
	};
	for (let e of Mo) {
		let n = No[e], r = Number(t[e]);
		a[e] = Number.isFinite(r) ? e === "maxResults" ? Fo(r) : Math.round(r) : n;
	}
	return a.takeOver = _s(t.takeOver), Object.assign(a, {
		...Io,
		...Ro(t)
	}), a;
}
function zl(e) {
	let t = Rl(e), n = zo(t);
	return {
		sources: {
			...t.sources,
			priority: [...t.priority],
			custom: n.sources.custom,
			useProxy: n.sources.useProxy
		},
		timeoutMs: t.timeoutMs,
		retries: t.retries,
		chainBudgetMs: t.chainBudgetMs,
		maxResults: t.maxResults,
		cacheTtlMs: t.cacheTtlMs,
		egoBudget: t.egoBudget,
		takeOver: t.takeOver,
		retryBackoffMs: n.retryBackoffMs,
		maxResponseBytes: n.maxResponseBytes,
		logCapacity: n.logCapacity,
		healthTimeoutMs: n.healthTimeoutMs,
		proxies: n.proxies
	};
}
function Bl(e) {
	let t = {}, n = _o(e?.sources);
	n.ok || (t.sources = n.errors[0]);
	let r = po(e?.priority);
	r.ok || (t.priority = r.errors[0]);
	for (let n of Mo) {
		let r = Go(n, e?.[n]);
		r.ok || (t[n] = r.message);
	}
	return {
		ok: Object.keys(t).length === 0,
		errors: t
	};
}
function Vl(e = {}) {
	let { baseUrl: t = "api/dsh-clsh-search", fetchImpl: n = typeof fetch == "function" ? fetch : void 0, timeoutMs: r = Il } = e;
	async function i(e, i = {}, a = !0) {
		if (typeof n != "function") throw Error("设置接口不可用（未注入 fetch 实现）");
		let o = new AbortController(), s = a && r > 0 ? setTimeout(() => o.abort(), r) : null;
		try {
			let r = await n(`${t}${e}`, {
				...i,
				headers: {
					accept: "application/json",
					...i.headers
				},
				signal: o.signal
			}), a = await r.json().catch(() => null);
			if (!r.ok) {
				let e = typeof a?.error?.code == "string" ? a.error.code : `http_${r.status}`, t = Error(a?.error?.message ?? `设置请求失败（HTTP ${r.status}）`);
				throw t.code = e, t.hint = typeof a?.error?.hint == "string" && a.error.hint.length > 0 ? a.error.hint : Ll[e] ?? Ll.default, t;
			}
			if (a == null) throw Error(`设置响应不是有效 JSON（HTTP ${r.status}）`);
			return a;
		} finally {
			s && clearTimeout(s);
		}
	}
	return {
		async load() {
			return Rl((await i("/settings"))?.data?.config);
		},
		async save(e) {
			let t = zl(e);
			return Rl((await i("/settings", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(t)
			}, !1))?.data?.config ?? t);
		},
		async diagnostics() {
			return (await i("/diagnostics"))?.data;
		},
		async probe(e) {
			return (await i("/diagnostics/probe", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ source: e })
			}, !1))?.data;
		},
		async onlineTest() {
			return (await i("/diagnostics/online", { method: "POST" }, !1))?.data;
		},
		async logs() {
			return (await i("/logs"))?.data;
		},
		async clearLogs() {
			return (await i("/logs/clear", { method: "POST" }, !1))?.data;
		},
		async clearCache() {
			return (await i("/cache/clear", { method: "POST" }, !1))?.data;
		}
	};
}
//#endregion
//#region src/App.vue
var Hl = { class: "cs-page" }, Ul = { class: "cs-page-head" }, Wl = { class: "cs-toolbar" }, Gl = { class: "cs-chip" }, Kl = { class: "cs-page-foot cs-error" }, ql = {
	__name: "App",
	props: { api: {
		type: Object,
		default: null
	} },
	setup(e) {
		let t = e, n = /* @__PURE__ */ P(Rl(Fl)), r = /* @__PURE__ */ P({}), i = /* @__PURE__ */ z(!0), a = /* @__PURE__ */ z(""), o = /* @__PURE__ */ z(!1);
		function s() {
			o.value = !0;
		}
		let c = Q(() => i.value ? "已保存" : "未保存更改"), l = Q(() => Array.isArray(n.custom) ? n.custom.length : 0);
		function u(e) {
			let { fieldError: t, ...o } = e, s = {
				...zl(n),
				...o
			};
			Object.assign(n, Rl(s), Ro(s));
			let c = Bl(n);
			for (let e of Object.keys(r)) delete r[e];
			Object.assign(r, c.errors, t ?? {}), i.value = !1, a.value = "";
		}
		function d() {
			let e = Bl(n);
			for (let e of Object.keys(r)) delete r[e];
			return Object.assign(r, e.errors), e;
		}
		async function f() {
			if (t.api && typeof t.api.load == "function") try {
				let e = await t.api.load();
				Object.assign(n, Rl(e), Ro(e)), i.value = !0, d();
			} catch (e) {
				a.value = e?.message ?? "设置加载失败";
			}
		}
		async function p() {
			if (!d().ok) {
				a.value = "设置有校验错误，未保存";
				return;
			}
			if (t.api && typeof t.api.save == "function") try {
				let e = zl(n), r = zo(n), i = {
					...e,
					...r,
					sources: {
						...e.sources,
						...r.sources
					}
				};
				Object.assign(n, Rl(await t.api.save(i)));
			} catch (e) {
				a.value = e?.message ?? "设置保存失败";
				return;
			}
			i.value = !0, a.value = "";
		}
		return tr(f), (e, i) => (K(), q("main", Hl, [
			J("header", Ul, [i[1] ||= J("div", null, [J("h1", { class: "cs-page-title" }, "搜索设置"), J("p", { class: "cs-page-intro" }, " 免 key 四源聚合（DDG → Bing → 360 → 百度）· 工具调用顺序：vault+记忆 → web_search → web_fetch → ego-browser 兜底 ")], -1), J("div", Wl, [J("span", Gl, A(c.value), 1), J("button", {
				class: "cs-btn-primary",
				type: "button",
				onClick: p
			}, "保存更改")])]),
			J("p", Kl, A(a.value), 1),
			Y(jo, {
				sources: n.sources,
				priority: n.priority,
				"custom-count": l.value,
				error: r.sources || r.priority || "",
				onChange: u
			}, null, 8, [
				"sources",
				"priority",
				"custom-count",
				"error"
			]),
			Y($c, {
				custom: n.custom,
				priority: n.priority,
				onChange: u
			}, null, 8, ["custom", "priority"]),
			Y(fs, {
				values: n,
				errors: r,
				onChange: u
			}, null, 8, ["values", "errors"]),
			Y(js, {
				"take-over": n.takeOver,
				onChange: u
			}, null, 8, ["take-over"]),
			Y(Pl, {
				proxies: n.proxies,
				"use-proxy": n.useProxy,
				custom: n.custom,
				onChange: u
			}, null, 8, [
				"proxies",
				"use-proxy",
				"custom"
			]),
			Y(Xs, {
				api: t.api,
				onOpenLog: s
			}, null, 8, ["api"]),
			Y(cc, { api: t.api }, null, 8, ["api"]),
			Y(Cc, {
				api: t.api,
				open: o.value,
				onClose: i[0] ||= (e) => o.value = !1
			}, null, 8, ["api", "open"]),
			i[2] ||= J("p", { class: "cs-page-foot" }, [
				X(" 配置持久化：profile "),
				J("code", null, "cordis.patch.yml"),
				X("（config 整行替换）· 数据落点 "),
				J("code", null, "~/.dsh/cache/dsh-clsh-search/")
			], -1)
		]));
	}
}, Jl = "data-dsh-clsh-search-style";
function Yl(e) {
	if (e.querySelector(`link[${Jl}]`)) return;
	let t = e.createElement("link");
	t.rel = "stylesheet", t.href = new URL("./style.css", "" + import.meta.url).href, t.setAttribute(Jl, ""), e.head.appendChild(t);
}
function Xl(e, t = {}) {
	Yl(e.ownerDocument ?? document);
	let n = ao(ql, { api: t.api ?? Vl({ baseUrl: t.apiBase }) });
	return n.mount(e), { unmount() {
		n.unmount();
	} };
}
var Zl = { mount: Xl };
//#endregion
export { Zl as default, Xl as mount };
