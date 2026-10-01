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
		this.flags |= 2, Ge(this), Ie(this);
		let e = M, t = N;
		M = this, N = !0;
		try {
			return this.fn();
		} finally {
			Le(this), M = e, N = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) Be(e);
			this.deps = this.depsTail = void 0, Ge(this), this.onStop && this.onStop(), this.flags &= -2;
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
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Ke) || (e.globalVersion = Ke, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Re(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = M, r = N;
	M = e, N = !0;
	try {
		Ie(e);
		let n = e.fn(e._value);
		(t.version === 0 || D(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		M = n, N = r, Le(e), e.flags &= -3;
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
var N = !0, He = [];
function Ue() {
	He.push(N), N = !1;
}
function We() {
	let e = He.pop();
	N = e === void 0 || e;
}
function Ge(e) {
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
var Ke = 0, qe = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, Je = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
	}
	track(e) {
		if (!M || !N || M === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== M) t = this.activeLink = new qe(M, this), M.deps ? (t.prevDep = M.depsTail, M.depsTail.nextDep = t, M.depsTail = t) : M.deps = M.depsTail = t, Ye(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = M.depsTail, t.nextDep = void 0, M.depsTail.nextDep = t, M.depsTail = t, M.deps === t && (M.deps = e);
		}
		return t;
	}
	trigger(e) {
		this.version++, Ke++, this.notify(e);
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
function Ye(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) Ye(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e;
	}
}
var Xe = /* @__PURE__ */ new WeakMap(), Ze = /* @__PURE__ */ Symbol(""), Qe = /* @__PURE__ */ Symbol(""), $e = /* @__PURE__ */ Symbol("");
function P(e, t, n) {
	if (N && M) {
		let t = Xe.get(e);
		t || Xe.set(e, t = /* @__PURE__ */ new Map());
		let r = t.get(n);
		r || (t.set(n, r = new Je()), r.map = t, r.key = n), r.track();
	}
}
function et(e, t, n, r, i, a) {
	let o = Xe.get(e);
	if (!o) {
		Ke++;
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
				(n === "length" || n === $e || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get($e)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(Ze)), f(e) && s(o.get(Qe)));
				break;
			case "delete":
				i || (s(o.get(Ze)), f(e) && s(o.get(Qe)));
				break;
			case "set": f(e) && s(o.get(Ze));
		}
	}
	Fe();
}
function tt(e) {
	let t = /* @__PURE__ */ R(e);
	return t === e || (P(t, "iterate", $e), /* @__PURE__ */ L(e)) ? t : /* @__PURE__ */ I(e) ? /* @__PURE__ */ Lt(e) ? t.map((e) => Bt(z(e))) : t.map(Bt) : t.map(z);
}
function nt(e) {
	return P(e = /* @__PURE__ */ R(e), "iterate", $e), e;
}
function F(e, t) {
	return /* @__PURE__ */ I(e) ? Bt(/* @__PURE__ */ Lt(e) ? z(t) : t) : z(t);
}
var rt = {
	__proto__: null,
	[Symbol.iterator]() {
		return it(this, Symbol.iterator, (e) => F(this, e));
	},
	concat(...e) {
		return tt(this).concat(...e.map((e) => d(e) ? tt(e) : e));
	},
	entries() {
		return it(this, "entries", (e) => (e[1] = F(this, e[1]), e));
	},
	every(e, t) {
		return ot(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return ot(this, "filter", e, t, (e) => e.map((e) => F(this, e)), arguments);
	},
	find(e, t) {
		return ot(this, "find", e, t, (e) => F(this, e), arguments);
	},
	findIndex(e, t) {
		return ot(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return ot(this, "findLast", e, t, (e) => F(this, e), arguments);
	},
	findLastIndex(e, t) {
		return ot(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return ot(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return ct(this, "includes", e);
	},
	indexOf(...e) {
		return ct(this, "indexOf", e);
	},
	join(e) {
		return tt(this).join(e);
	},
	lastIndexOf(...e) {
		return ct(this, "lastIndexOf", e);
	},
	map(e, t) {
		return ot(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return lt(this, "pop");
	},
	push(...e) {
		return lt(this, "push", e);
	},
	reduce(e, ...t) {
		return st(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return st(this, "reduceRight", e, t);
	},
	shift() {
		return lt(this, "shift");
	},
	some(e, t) {
		return ot(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return lt(this, "splice", e);
	},
	toReversed() {
		return tt(this).toReversed();
	},
	toSorted(e) {
		return tt(this).toSorted(e);
	},
	toSpliced(...e) {
		return tt(this).toSpliced(...e);
	},
	unshift(...e) {
		return lt(this, "unshift", e);
	},
	values() {
		return it(this, "values", (e) => F(this, e));
	}
};
function it(e, t, n) {
	let r = nt(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ L(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var at = Array.prototype;
function ot(e, t, n, r, i, a) {
	let o = nt(e), s = o !== e && !/* @__PURE__ */ L(e), c = o[t];
	if (c !== at[t]) {
		let t = c.apply(e, a);
		return s ? z(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, F(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function st(e, t, n, r) {
	let i = nt(e), a = i !== e && !/* @__PURE__ */ L(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = F(e, t)), n.call(this, t, F(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? F(e, c) : c;
}
function ct(e, t, n) {
	let r = /* @__PURE__ */ R(e);
	P(r, "iterate", $e);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ Rt(n[0]) ? (n[0] = /* @__PURE__ */ R(n[0]), r[t](...n)) : i;
}
function lt(e, t, n = []) {
	Ue(), Pe();
	let r = (/* @__PURE__ */ R(e))[t].apply(e, n);
	return Fe(), We(), r;
}
var ut = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), dt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function ft(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ R(this);
	return P(t, "has", e), t.hasOwnProperty(e);
}
var pt = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? jt : At : i ? kt : Ot).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = rt[t])) return e;
			if (t === "hasOwnProperty") return ft;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ B(e) ? e : n);
		if ((_(t) ? dt.has(t) : ut(t)) || (r || P(e, "get", t), i)) return o;
		if (/* @__PURE__ */ B(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ Ft(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ Ft(o) : /* @__PURE__ */ Nt(o) : o;
	}
}, mt = class extends pt {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let e = /* @__PURE__ */ I(i);
			if (!/* @__PURE__ */ L(n) && !/* @__PURE__ */ I(n) && (i = /* @__PURE__ */ R(i), n = /* @__PURE__ */ R(n)), !a && /* @__PURE__ */ B(i) && !/* @__PURE__ */ B(n)) return e || (i.value = n), !0;
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ B(e) ? e : r);
		return e === /* @__PURE__ */ R(r) && s && (o ? D(n, i) && et(e, "set", t, n, i) : et(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && et(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !dt.has(t)) && P(e, "has", t), n;
	}
	ownKeys(e) {
		return P(e, "iterate", d(e) ? "length" : Ze), Reflect.ownKeys(e);
	}
}, ht = class extends pt {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return !0;
	}
	deleteProperty(e, t) {
		return !0;
	}
}, gt = /* @__PURE__ */ new mt(), _t = /* @__PURE__ */ new ht(), vt = /* @__PURE__ */ new mt(!0), yt = (e) => e, bt = (e) => Reflect.getPrototypeOf(e);
function xt(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ R(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? yt : t ? Bt : z;
		return !t && P(a, "iterate", l ? Qe : Ze), s(Object.create(u), { next() {
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
function St(e) {
	return function(...t) {
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function Ct(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ R(r), a = /* @__PURE__ */ R(n);
			e || (D(n, a) && P(i, "get", n), P(i, "get", a));
			let { has: o } = bt(i), s = t ? yt : e ? Bt : z;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && P(/* @__PURE__ */ R(t), "iterate", Ze), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ R(n), i = /* @__PURE__ */ R(t);
			return e || (D(t, i) && P(r, "has", t), P(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ R(a), s = t ? yt : e ? Bt : z;
			return !e && P(o, "iterate", Ze), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: St("add"),
		set: St("set"),
		delete: St("delete"),
		clear: St("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ R(this), r = bt(n), i = /* @__PURE__ */ R(e), a = !t && !/* @__PURE__ */ L(e) && !/* @__PURE__ */ I(e) ? i : e;
			return r.has.call(n, a) || D(e, a) && r.has.call(n, e) || D(i, a) && r.has.call(n, i) || (n.add(a), et(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ L(n) && !/* @__PURE__ */ I(n) && (n = /* @__PURE__ */ R(n));
			let r = /* @__PURE__ */ R(this), { has: i, get: a } = bt(r), o = i.call(r, e);
			o ||= (e = /* @__PURE__ */ R(e), i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? D(n, s) && et(r, "set", e, n, s) : et(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ R(this), { has: n, get: r } = bt(t), i = n.call(t, e);
			i ||= (e = /* @__PURE__ */ R(e), n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && et(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ R(this), t = e.size !== 0, n = e.clear();
			return t && et(e, "clear", void 0, void 0, void 0), n;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = xt(r, e, t);
	}), n;
}
function wt(e, t) {
	let n = Ct(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var Tt = { get: /* @__PURE__ */ wt(!1, !1) }, Et = { get: /* @__PURE__ */ wt(!1, !0) }, Dt = { get: /* @__PURE__ */ wt(!0, !1) }, Ot = /* @__PURE__ */ new WeakMap(), kt = /* @__PURE__ */ new WeakMap(), At = /* @__PURE__ */ new WeakMap(), jt = /* @__PURE__ */ new WeakMap();
function Mt(e) {
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
function Nt(e) {
	return /* @__PURE__ */ I(e) ? e : It(e, !1, gt, Tt, Ot);
}
// @__NO_SIDE_EFFECTS__
function Pt(e) {
	return It(e, !1, vt, Et, kt);
}
// @__NO_SIDE_EFFECTS__
function Ft(e) {
	return It(e, !0, _t, Dt, At);
}
function It(e, t, n, r, i) {
	if (!v(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = Mt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Lt(e) {
	return /* @__PURE__ */ I(e) ? /* @__PURE__ */ Lt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function L(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function Rt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function R(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ R(t) : e;
}
function zt(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && O(e, "__v_skip", !0), e;
}
var z = (e) => v(e) ? /* @__PURE__ */ Nt(e) : e, Bt = (e) => v(e) ? /* @__PURE__ */ Ft(e) : e;
// @__NO_SIDE_EFFECTS__
function B(e) {
	return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function Vt(e) {
	return Ht(e, !1);
}
function Ht(e, t) {
	return /* @__PURE__ */ B(e) ? e : new Ut(e, t);
}
var Ut = class {
	constructor(e, t) {
		this.dep = new Je(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : /* @__PURE__ */ R(e), this._value = t ? e : z(e), this.__v_isShallow = t;
	}
	get value() {
		return this.dep.track(), this._value;
	}
	set value(e) {
		let t = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ L(e) || /* @__PURE__ */ I(e);
		e = n ? e : /* @__PURE__ */ R(e), D(e, t) && (this._rawValue = e, this._value = n ? e : z(e), this.dep.trigger());
	}
};
function V(e) {
	return /* @__PURE__ */ B(e) ? e.value : e;
}
var Wt = {
	get: (e, t, n) => t === "__v_raw" ? e : V(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ B(i) && !/* @__PURE__ */ B(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function Gt(e) {
	return /* @__PURE__ */ Lt(e) ? e : new Proxy(e, Wt);
}
var Kt = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new Je(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Ke - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
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
function qt(e, t, n = !1) {
	let r, i;
	return h(e) ? r = e : (r = e.get, i = e.set), new Kt(r, i, n);
}
var Jt = {}, Yt = /* @__PURE__ */ new WeakMap(), Xt = void 0;
function Zt(e, t = !1, n = Xt) {
	if (n) {
		let t = Yt.get(n);
		t || Yt.set(n, t = []), t.push(e);
	}
}
function Qt(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => o ? e : /* @__PURE__ */ L(e) || o === !1 || o === 0 ? $t(e, 1) : $t(e), m, g, _, v, y = !1, b = !1;
	if (/* @__PURE__ */ B(e) ? (g = () => e.value, y = /* @__PURE__ */ L(e)) : /* @__PURE__ */ Lt(e) ? (g = () => p(e), y = !0) : d(e) ? (b = !0, y = e.some((e) => /* @__PURE__ */ Lt(e) || /* @__PURE__ */ L(e)), g = () => e.map((e) => {
		if (/* @__PURE__ */ B(e)) return e.value;
		if (/* @__PURE__ */ Lt(e)) return p(e);
		if (h(e)) return f ? f(e, 2) : e();
	})) : g = h(e) ? n ? f ? () => f(e, 2) : e : () => {
		if (_) {
			Ue();
			try {
				_();
			} finally {
				We();
			}
		}
		let t = Xt;
		Xt = m;
		try {
			return f ? f(e, 3, [v]) : e(v);
		} finally {
			Xt = t;
		}
	} : r, n && o) {
		let e = g, t = o === !0 ? Infinity : o;
		g = () => $t(e(), t);
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
	let C = b ? Array(e.length).fill(Jt) : Jt, w = (e) => {
		if (m.flags & 1 && (m.dirty || e)) {
			if (n) {
				let t = m.run();
				if (e || o || y || (b ? t.some((e, t) => D(e, C[t])) : D(t, C))) {
					_ && _();
					let e = Xt;
					Xt = m;
					try {
						let e = [
							t,
							C === Jt ? void 0 : b && C[0] === Jt ? [] : C,
							v
						];
						C = t, f ? f(n, 3, e) : n(...e);
					} finally {
						Xt = e;
					}
				}
			} else m.run();
		}
	};
	return u && u(w), m = new ke(g), m.scheduler = l ? () => l(w, !1) : w, v = (e) => Zt(e, !1, m), _ = m.onStop = () => {
		let e = Yt.get(m);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			Yt.delete(m);
		}
	}, n ? a ? w(!0) : C = m.run() : l ? l(w.bind(null, !0), !0) : m.run(), S.pause = m.pause.bind(m), S.resume = m.resume.bind(m), S.stop = S, S;
}
function $t(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ B(e)) $t(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) $t(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		$t(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) $t(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && $t(e[r], t, n);
	}
	return e;
}
//#endregion
//#region node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
function en(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		tn(e, t, n);
	}
}
function H(e, t, n, r) {
	if (h(e)) {
		let i = en(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			tn(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(H(e[a], t, n, r));
		return i;
	}
}
function tn(e, n, r, i = !0) {
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
			Ue(), en(o, null, 10, [
				e,
				i,
				a
			]), We();
			return;
		}
	}
	nn(e, r, a, i, s);
}
function nn(e, t, n, r = !0, i = !1) {
	if (i) throw e;
	console.error(e);
}
var U = [], W = -1, rn = [], an = null, on = 0, sn = /* @__PURE__ */ Promise.resolve(), cn = null;
function ln(e) {
	let t = cn || sn;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function un(e) {
	let t = W + 1, n = U.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = U[r], a = gn(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function dn(e) {
	if (!(e.flags & 1)) {
		let t = gn(e), n = U[U.length - 1];
		!n || !(e.flags & 2) && t >= gn(n) ? U.push(e) : U.splice(un(t), 0, e), e.flags |= 1, fn();
	}
}
function fn() {
	cn ||= sn.then(_n);
}
function pn(e) {
	if (!d(e)) an && e.id === -1 ? an.splice(on + 1, 0, e) : e.flags & 1 || (rn.push(e), e.flags |= 1);
	else for (let t = 0; t < e.length; t++) rn.push(e[t]);
	fn();
}
function mn(e, t, n = W + 1) {
	for (; n < U.length; n++) {
		let t = U[n];
		if (t && t.flags & 2) {
			if (e && t.id !== e.uid) continue;
			U.splice(n, 1), n--, t.flags & 4 && (t.flags &= -2), t(), t.flags & 4 || (t.flags &= -2);
		}
	}
}
function hn(e) {
	if (rn.length) {
		let e = [...new Set(rn)].sort((e, t) => gn(e) - gn(t));
		if (rn.length = 0, an) {
			for (let t = 0; t < e.length; t++) an.push(e[t]);
			return;
		}
		for (an = e, on = 0; on < an.length; on++) {
			let e = an[on];
			e.flags & 4 && (e.flags &= -2), e.flags & 8 || e(), e.flags &= -2;
		}
		an = null, on = 0;
	}
}
var gn = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function _n(e) {
	try {
		for (W = 0; W < U.length; W++) {
			let e = U[W];
			e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), en(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2));
		}
	} finally {
		for (; W < U.length; W++) {
			let e = U[W];
			e && (e.flags &= -2);
		}
		W = -1, U.length = 0, hn(e), cn = null, (U.length || rn.length) && _n(e);
	}
}
var G = null, vn = null;
function yn(e) {
	let t = G;
	return G = e, vn = e && e.type.__scopeId || null, t;
}
function bn(e, t = G, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && wi(-1);
		let i = yn(t), a = xi.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = xi.length; e > a; e--) Si();
			yn(i), r._d && wi(1);
		}
		return o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function xn(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (Ue(), H(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), We());
	}
}
function Sn(e, t) {
	if ($) {
		let n = $.provides, r = $.parent && $.parent.provides;
		r === n && (n = $.provides = Object.create(r)), n[e] = t;
	}
}
function Cn(e, t, n = !1) {
	let r = Ui();
	if (r || kr) {
		let i = kr ? kr._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
	}
}
var wn = /* @__PURE__ */ Symbol.for("v-scx"), Tn = () => Cn(wn);
function En(e, t, n) {
	return Dn(e, t, n);
}
function Dn(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i, u = s({}, i), d = n && a || !n && c !== "post", f;
	if (Yi) {
		if (c === "sync") {
			let e = Tn();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = $;
	u.call = (e, t, n) => H(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		q(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : dn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = Qt(e, n, u);
	return Yi && (f ? f.push(h) : d && h()), h;
}
function On(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? kn(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Ki(this), s = Dn(i, a.bind(r), n);
	return o(), s;
}
function kn(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var An = /* @__PURE__ */ Symbol("_vte"), jn = (e) => e.__isTeleport, Mn = /* @__PURE__ */ Symbol("_leaveCb");
function Nn(e) {
	let t = e[0];
	if (e.length > 1) {
		for (let n of e) if (n.type !== yi) {
			t = n;
			break;
		}
	}
	return t;
}
function Pn(e) {
	if (!Hn(e)) return jn(e.type) && e.children ? Nn(e.children) : e;
	if (e.component) return e.component.subTree;
	let { shapeFlag: t, children: n } = e;
	if (n) {
		if (t & 16) return n[0];
		if (t & 32 && h(n.default)) return n.default();
	}
}
function Fn(e, t) {
	if (e.shapeFlag & 6 && e.component) {
		e.transition = t;
		let n = e.component.subTree;
		Fn(jn(n.type) && Pn(n) || n, t);
	} else e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
function In(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
function Ln(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var Rn = /* @__PURE__ */ new WeakMap();
function zn(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => zn(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Vn(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && zn(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? na(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e, m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ R(v), b = v === t ? i : (e) => !Ln(_, e) && u(y, e), x = (e, t) => !(t && Ln(_, t));
	if (m != null && m !== p) {
		if (Bn(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ B(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) en(p, f, 12, [l, _]);
	else {
		let t = g(p), n = /* @__PURE__ */ B(p);
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
					i(), Rn.delete(e);
				};
				t.id = -1, Rn.set(e, t), q(t, r);
			} else Bn(e), i();
		}
	}
}
function Bn(e) {
	let t = Rn.get(e);
	t && (t.flags |= 8, Rn.delete(e));
}
le().requestIdleCallback, le().cancelIdleCallback;
var Vn = (e) => !!e.type.__asyncLoader, Hn = (e) => e.type.__isKeepAlive;
function Un(e, t) {
	Gn(e, "a", t);
}
function Wn(e, t) {
	Gn(e, "da", t);
}
function Gn(e, t, n = $) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (qn(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) Hn(e.parent.vnode) && Kn(r, t, n, e), e = e.parent;
	}
}
function Kn(e, t, n, r) {
	let i = qn(t, e, r, !0);
	er(() => {
		c(r[t], i);
	}, n);
}
function qn(e, t, n = $, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			Ue();
			let i = Ki(n), a = H(t, n, e, r);
			return i(), We(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
}
var Jn = (e) => (t, n = $) => {
	(!Yi || e === "sp") && qn(e, (...e) => t(...e), n);
}, Yn = Jn("bm"), Xn = Jn("m"), Zn = Jn("bu"), Qn = Jn("u"), $n = Jn("bum"), er = Jn("um"), tr = Jn("sp"), nr = Jn("rtg"), rr = Jn("rtc");
function ir(e, t = $) {
	qn("ec", e, t);
}
var ar = /* @__PURE__ */ Symbol.for("v-ndc");
function or(e, t, n, r) {
	let i, a = n && n[r], o = d(e);
	if (o || g(e)) {
		let n = o && /* @__PURE__ */ Lt(e), r = !1, s = !1;
		n && (r = !/* @__PURE__ */ L(e), s = /* @__PURE__ */ I(e), e = nt(e)), i = Array(e.length);
		for (let n = 0, o = e.length; n < o; n++) i[n] = t(r ? s ? Bt(z(e[n])) : z(e[n]) : e[n], n, void 0, a && a[n]);
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
var sr = (e) => e ? Ji(e) ? na(e) : sr(e.parent) : null, cr = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => e.vnode.el,
	$data: (e) => e.data,
	$props: (e) => e.props,
	$attrs: (e) => e.attrs,
	$slots: (e) => e.slots,
	$refs: (e) => e.refs,
	$parent: (e) => sr(e.parent),
	$root: (e) => sr(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => _r(e),
	$forceUpdate: (e) => e.f ||= () => {
		dn(e.update);
	},
	$nextTick: (e) => e.n ||= ln.bind(e.proxy),
	$watch: (e) => On.bind(e)
}), lr = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), ur = {
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
			else if (lr(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else fr && (s[n] = 0);
		}
		let d = cr[n], f, p;
		if (d) return n === "$attrs" && P(e.attrs, "get", ""), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return lr(a, n) ? (a[n] = r, !0) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) || n[0] === "$" && n.slice(1) in e ? !1 : (o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || lr(n, c) || u(o, c) || u(i, c) || u(cr, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
function dr(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
var fr = !0;
function pr(e) {
	let t = _r(e), n = e.proxy, i = e.ctx;
	fr = !1, t.beforeCreate && hr(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: y, deactivated: b, beforeDestroy: x, beforeUnmount: S, destroyed: C, unmounted: w, render: ee, renderTracked: te, renderTriggered: ne, errorCaptured: T, serverPrefetch: re, expose: E, inheritAttrs: ie, components: ae, directives: D, filters: oe } = t;
	if (u && mr(u, i, null), s) for (let e in s) {
		let t = s[e];
		h(t) && (i[e] = t.bind(n));
	}
	if (a) {
		let t = a.call(n, n);
		v(t) && (e.data = /* @__PURE__ */ Nt(t));
	}
	if (fr = !0, o) for (let e in o) {
		let t = o[e], a = ia({
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
	if (c) for (let e in c) gr(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			Sn(t, e[t]);
		});
	}
	f && hr(f, e, "c");
	function O(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (O(Yn, p), O(Xn, m), O(Zn, g), O(Qn, _), O(Un, y), O(Wn, b), O(ir, T), O(rr, te), O(nr, ne), O($n, S), O(er, w), O(tr, re), d(E)) {
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
	ee && e.render === r && (e.render = ee), ie != null && (e.inheritAttrs = ie), ae && (e.components = ae), D && (e.directives = D), re && In(e);
}
function mr(e, t, n = r) {
	d(e) && (e = Sr(e));
	for (let n in e) {
		let r = e[n], i;
		i = v(r) ? "default" in r ? Cn(r.from || n, r.default, !0) : Cn(r.from || n) : Cn(r), /* @__PURE__ */ B(i) ? Object.defineProperty(t, n, {
			enumerable: !0,
			configurable: !0,
			get: () => i.value,
			set: (e) => i.value = e
		}) : t[n] = i;
	}
}
function hr(e, t, n) {
	H(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function gr(e, t, n, r) {
	let i = r.includes(".") ? kn(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) && En(i, n);
	} else if (h(e)) En(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => gr(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) && En(i, r, e);
		}
	}
}
function _r(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => vr(c, e, o, !0)), vr(c, t, o)), v(t) && a.set(t, c), c;
}
function vr(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && vr(e, a, n, !0), i && i.forEach((t) => vr(e, t, n, !0));
	for (let i in t) if (!(r && i === "expose")) {
		let r = yr[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var yr = {
	data: br,
	props: wr,
	emits: wr,
	methods: Cr,
	computed: Cr,
	beforeCreate: K,
	created: K,
	beforeMount: K,
	mounted: K,
	beforeUpdate: K,
	updated: K,
	beforeDestroy: K,
	beforeUnmount: K,
	destroyed: K,
	unmounted: K,
	activated: K,
	deactivated: K,
	errorCaptured: K,
	serverPrefetch: K,
	components: Cr,
	directives: Cr,
	watch: Tr,
	provide: br,
	inject: xr
};
function br(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function xr(e, t) {
	return Cr(Sr(e), Sr(t));
}
function Sr(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function K(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function Cr(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function wr(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), dr(e), dr(t ?? {})) : t;
}
function Tr(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = K(e[r], t[r]);
	return n;
}
function Er() {
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
var Dr = 0;
function Or(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (r = null);
		let i = Er(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: Dr++,
			_component: n,
			_props: r,
			_container: null,
			_context: i,
			_instance: null,
			version: aa,
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
					let u = l._ceVNode || Ai(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, na(u.component);
				}
			},
			onUnmount(e) {
				o.push(e);
			},
			unmount() {
				c && (H(o, l._instance, 16), e(null, l._container), delete l._container.__vue_app__);
			},
			provide(e, t) {
				return i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = kr;
				kr = l;
				try {
					return e();
				} finally {
					kr = t;
				}
			}
		};
		return l;
	};
}
var kr = null, Ar = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${T(t)}Modifiers`] || e[`${E(t)}Modifiers`];
function jr(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t, a = r, o = n.startsWith("update:"), s = o && Ar(i, n.slice(7));
	s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = a.map(se)));
	let c, l = i[c = ae(n)] || i[c = ae(T(n))];
	!l && o && (l = i[c = ae(E(n))]), l && H(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, H(u, e, 6, a);
	}
}
var Mr = /* @__PURE__ */ new WeakMap();
function Nr(e, t, n = !1) {
	let r = n ? Mr : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Nr(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function Pr(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, E(t)) || u(e, t));
}
function Fr(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [a], slots: s, attrs: c, emit: l, render: u, renderCache: d, props: f, data: p, setupState: m, ctx: h, inheritAttrs: g } = e, _ = yn(e), v, y;
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = e;
			v = Fi(u.call(t, e, d, f, m, p, h)), y = c;
		} else {
			let e = t;
			v = Fi(e.length > 1 ? e(f, {
				attrs: c,
				slots: s,
				emit: l
			}) : e(f, null)), y = t.props ? c : Ir(c);
		}
	} catch (t) {
		xi.length = 0, tn(t, e, 1), v = Ai(yi);
	}
	let b = v;
	if (y && g !== !1) {
		let e = Object.keys(y), { shapeFlag: t } = b;
		e.length && t & 7 && (a && e.some(o) && (y = Lr(y, a)), b = Ni(b, y, !1, !0));
	}
	return n.dirs && (b = Ni(b, null, !1, !0), b.dirs = b.dirs ? b.dirs.concat(n.dirs) : n.dirs), n.transition && Fn(jn(b.type) && Pn(b) || b, n.transition), v = b, yn(_), v;
}
var Ir = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, Lr = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
};
function Rr(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? zr(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (Br(o, r, n) && !Pr(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || zr(r, o, l) : !!o;
	return !1;
}
function zr(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (Br(t, e, a) && !Pr(n, a)) return !0;
	}
	return !1;
}
function Br(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !Se(r, i) : r !== i;
}
function Vr({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var Hr = {}, Ur = () => Object.create(Hr), Wr = (e) => Object.getPrototypeOf(e) === Hr;
function Gr(e, t, n, r = !1) {
	let i = {}, a = Ur();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), qr(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	e.props = n ? r ? i : /* @__PURE__ */ Pt(i) : e.type.props ? i : a, e.attrs = a;
}
function Kr(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ R(i), [c] = e.propsOptions, l = !1;
	if ((r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (Pr(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = T(o);
						i[t] = Jr(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		qr(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = E(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = Jr(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && et(e.attrs, "set", "");
}
function qr(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (ee(t)) continue;
		let l = n[t], d;
		a && u(a, d = T(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : Pr(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ R(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = Jr(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function Jr(e, t, n, r, i, a) {
	let o = e[n];
	if (o != null) {
		let e = u(o, "default");
		if (e && r === void 0) {
			let e = o.default;
			if (o.type !== Function && !o.skipFactory && h(e)) {
				let { propsDefaults: a } = i;
				if (n in a) r = a[n];
				else {
					let o = Ki(i);
					r = a[n] = e.call(null, t), o();
				}
			} else r = e;
			i.ce && i.ce._setProp(n, r);
		}
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === E(n)) && (r = !0));
	}
	return r;
}
var Yr = /* @__PURE__ */ new WeakMap();
function Xr(e, r, i = !1) {
	let a = i ? Yr : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = Xr(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		let n = T(c[e]);
		Zr(n) && (l[n] = t);
	}
	else if (c) for (let e in c) {
		let t = T(e);
		if (Zr(t)) {
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
function Zr(e) {
	return e[0] !== "$" && !ee(e);
}
var Qr = (e) => e === "_" || e === "_ctx" || e === "$stable", $r = (e) => d(e) ? e.map(Fi) : [Fi(e)], ei = (e, t, n) => {
	if (t._n) return t;
	let r = bn((...e) => $r(t(...e)), n);
	return r._c = !1, r;
}, ti = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (Qr(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = ei(n, i, r);
		else if (i != null) {
			let e = $r(i);
			t[n] = () => e;
		}
	}
}, ni = (e, t) => {
	let n = $r(t);
	e.slots.default = () => n;
}, ri = (e, t, n) => {
	for (let r in t) (n || !Qr(r)) && (e[r] = t[r]);
}, ii = (e, t, n) => {
	let r = e.slots = Ur();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (ri(r, t, n), n && O(r, "_", e, !0)) : ti(t, r);
	} else t && ni(e, t);
}, ai = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let e = n._;
		e ? r && e === 1 ? o = !1 : ri(a, n, r) : (o = !n.$stable, ti(n, a)), s = n;
	} else n && (ni(e, n), s = { default: 1 });
	if (o) for (let e in a) !Qr(e) && s[e] == null && delete a[e];
}, q = _i;
function oi(e) {
	return si(e);
}
function si(e, i) {
	let a = le();
	a.__VUE__ = !0;
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, r, i = null, a = null, o = null, s = void 0, c = null, l = !!t.dynamicChildren) => {
		if (e === t) return;
		e && !Di(e, t) && (i = ye(e), k(e, a, o, !0), e = null), t.patchFlag === -2 && (l = !1, t.dynamicChildren = null), t.dynamicChildren && e && e.dynamicChildren && e.dynamicChildren.hasOnce && (t.dynamicChildren === n && (t.dynamicChildren = []), t.dynamicChildren.hasOnce = !0);
		let { type: u, ref: d, shapeFlag: f } = t;
		switch (u) {
			case vi:
				y(e, t, r, i);
				break;
			case yi:
				b(e, t, r, i);
				break;
			case bi:
				e ?? x(t, r, i, s);
				break;
			case J:
				ae(e, t, r, i, a, o, s, c, l);
				break;
			default: f & 1 ? w(e, t, r, i, a, o, s, c, l) : f & 6 ? D(e, t, r, i, a, o, s, c, l) : (f & 64 || f & 128) && u.process(e, t, r, i, a, o, s, c, l, Se);
		}
		d != null && a ? zn(d, e && e.ref, o, t || e, !t) : d == null && e && e.ref != null && zn(e.ref, null, o, e, !0);
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
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && T(e.children, d, null, r, i, ci(e, a), s, u), _ && xn(e, null, r, "created"), ne(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !ee(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && zi(f, r, e);
		}
		_ && xn(e, null, r, "beforeMount");
		let v = ui(i, g);
		v && g.beforeEnter(d), o(d, t, n), ((f = m && m.onVnodeMounted) || v || _) && q(() => {
			try {
				f && zi(f, r, e), v && g.enter(d), _ && xn(e, null, r, "mounted");
			} finally {}
		}, i);
	}, ne = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (t === n || gi(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				ne(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, T = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? Ii(e[l]) : Fi(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, re = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el, { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && li(r, !1), (g = h.onVnodeBeforeUpdate) && zi(g, r, n, e), f && xn(n, e, r, "beforeUpdate"), r && li(r, !0), d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? E(e.dynamicChildren, d, l, r, i, ci(n, a), o) : s || de(e, n, l, null, r, i, ci(n, a), o, !1), u > 0) {
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
		((g = h.onVnodeUpdated) || f) && q(() => {
			g && zi(g, r, n, e), f && xn(n, e, r, "updated");
		}, i);
	}, E = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === J || !Di(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
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
		h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), T(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (E(e.dynamicChildren, m, n, i, a, s, c), (t.key != null || i && t === i.subTree) && di(e, t, !0)) : de(e, t, n, f, i, a, s, c, l);
	}, D = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : O(t, n, r, i, a, o, c) : se(e, t, c);
	}, O = (e, t, n, r, i, a, o) => {
		let s = e.component = Hi(e, r, i);
		if (Hn(e) && (s.ctx.renderer = Se), Xi(s, !1, o), s.asyncDep) {
			if (i && i.registerDep(s, ce, o), !e.el) {
				let r = s.subTree = Ai(yi);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else ce(s, e, t, n, i, a, o);
	}, se = (e, t, n) => {
		let r = t.component = e.component;
		if (Rr(e, t, n)) {
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
					let n = pi(e);
					if (n) {
						t && (t.el = c.el, ue(e, t, o)), n.asyncDep.then(() => {
							q(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				li(e, !1), t ? (t.el = c.el, ue(e, t, o)) : t = c, n && oe(n), (d = t.props && t.props.onVnodeBeforeUpdate) && zi(d, s, t, c), li(e, !0);
				let f = Fr(e), p = e.subTree;
				e.subTree = f, v(p, f, m(p.el), ye(p), e, i, a), t.el = f.el, u === null && Vr(e, f.el), r && q(r, i), (d = t.props && t.props.onVnodeUpdated) && q(() => zi(d, s, t, c), i);
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Vn(t);
				if (li(e, !1), l && oe(l), !m && (o = c && c.onVnodeBeforeMount) && zi(o, d, t), li(e, !0), s && A) {
					let t = () => {
						e.subTree = Fr(e), A(s, e.subTree, e, i, null);
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0);
					let o = e.subTree = Fr(e);
					v(null, o, n, r, e, i, a), t.el = o.el;
				}
				if (u && q(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					q(() => zi(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Vn(d.vnode) && d.vnode.shapeFlag & 256) && e.a && q(e.a, i), e.isMounted = !0, t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new ke(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => dn(u), li(e, !0), l();
	}, ue = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, Kr(e, t.props, r, n), ai(e, t.children, n), Ue(), mn(e), We();
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
			let n = t[p] = l ? Ii(t[p]) : Fi(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? ve(e, a, o, !0, !1, f) : T(t, r, i, a, o, s, c, l, f);
	}, pe = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? Ii(t[u]) : Fi(t[u]);
			if (Di(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? Ii(t[p]) : Fi(t[p]);
			if (Di(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? Ii(t[u]) : Fi(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) k(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? Ii(t[u]) : Fi(t[u]);
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
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && Di(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? k(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? fi(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || hi(f) : i;
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
		if (c === J) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) me(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === bi) {
			S(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[Mn] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), q(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[Mn];
					a._isLeaving && a[Mn](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, k = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if ((d === -2 || l && l.hasOnce) && (i = !1), s != null && (Ue(), zn(s, null, n, e, !0), We()), p != null && (!e.ctx || e.ctx === t) && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Vn(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && zi(_, t, e), u & 6) _e(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && xn(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, Se, r) : l && !l.hasOnce && (a !== J || d > 0 && d & 64) ? ve(l, t, n, !1, !0) : (a === J && d & 384 || !i && u & 16) && ve(c, t, n), r && he(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && q(() => {
			_ && zi(_, t, e), h && xn(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, he = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === J) {
			ge(n, r);
			return;
		}
		if (t === bi) {
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
		mi(c), mi(l), r && oe(r), i.stop(), a ? (a.flags |= 8, k(o, e, t, n)) : e.vnode.el && o && (o.transition = e.vnode.transition, k(o, e, t, n)), s && q(s, t), q(() => {
			e.isUnmounted = !0;
		}, t);
	}, ve = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) k(e[o], t, n, r, i);
	}, ye = (e) => {
		if (e.shapeFlag & 6) return ye(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[An];
		return n ? h(n) : t;
	}, be = !1, xe = (e, t, n) => {
		let r;
		e == null ? t._vnode && (k(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, be ||= (be = !0, mn(r), hn(), !1);
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
		createApp: Or(xe, Ce)
	};
}
function ci({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function li({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function ui(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function di(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = Ii(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && di(t, a)), a.type === vi && (a.patchFlag === -1 && (a = i[e] = Ii(a)), a.el = t.el), a.type === yi && !a.el && (a.el = t.el);
	}
}
function fi(e) {
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
function pi(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : pi(t);
}
function mi(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function hi(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? hi(t.subTree) : null;
}
var gi = (e) => e.__isSuspense;
function _i(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : pn(e);
}
var J = /* @__PURE__ */ Symbol.for("v-fgt"), vi = /* @__PURE__ */ Symbol.for("v-txt"), yi = /* @__PURE__ */ Symbol.for("v-cmt"), bi = /* @__PURE__ */ Symbol.for("v-stc"), xi = [], Y = null;
function X(e = !1) {
	xi.push(Y = e ? null : []);
}
function Si() {
	xi.pop(), Y = xi[xi.length - 1] || null;
}
var Ci = 1;
function wi(e, t = !1) {
	Ci += e, e < 0 && Y && t && (Y.hasOnce = !0);
}
function Ti(e) {
	return e.dynamicChildren = Ci > 0 ? Y || n : null, Si(), Ci > 0 && Y && Y.push(e), e;
}
function Z(e, t, n, r, i, a) {
	return Ti(Q(e, t, n, r, i, a, !0));
}
function Ei(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function Di(e, t) {
	return e.type === t.type && e.key === t.key;
}
var Oi = ({ key: e }) => e ?? null, ki = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ B(e) || h(e) ? {
	i: G,
	r: e,
	k: t,
	f: !!n
} : e);
function Q(e, t = null, n = null, r = 0, i = null, a = e === J ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && Oi(t),
		ref: t && ki(t),
		scopeId: vn,
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
		ctx: G
	};
	return s ? (Li(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), Ci > 0 && !o && Y && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && Y.push(c), c;
}
var Ai = ji;
function ji(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === ar) && (e = yi), Ei(e)) {
		let r = Ni(e, t, !0);
		return n && Li(r, n), Ci > 0 && !a && Y && (r.shapeFlag & 6 ? Y[Y.indexOf(e)] = r : Y.push(r)), r.patchFlag = -2, r;
	}
	if (ra(e) && (e = e.__vccOpts), t) {
		t = Mi(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = k(e)), v(n) && (/* @__PURE__ */ Rt(n) && !d(n) && (n = s({}, n)), t.style = ue(n));
	}
	let o = g(e) ? 1 : gi(e) ? 128 : jn(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return Q(e, t, n, r, i, o, a, !0);
}
function Mi(e) {
	return e ? /* @__PURE__ */ Rt(e) || Wr(e) ? s({}, e) : e : null;
}
function Ni(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? Ri(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && Oi(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(ki(t)) : [a, ki(t)] : ki(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== J ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && Ni(e.ssContent),
		ssFallback: e.ssFallback && Ni(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce,
		cacheIndex: e.cacheIndex
	};
	return c && r && Fn(u, c.clone(u)), u;
}
function Pi(e = " ", t = 0) {
	return Ai(vi, null, e, t);
}
function Fi(e) {
	return e == null || typeof e == "boolean" ? Ai(yi) : d(e) ? Ai(J, null, e.slice()) : Ei(e) ? Ii(e) : Ai(vi, null, String(e));
}
function Ii(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : Ni(e);
}
function Li(e, t) {
	let n = 0, { shapeFlag: r } = e;
	if (t == null) t = null;
	else if (d(t)) n = 16;
	else if (typeof t == "object") {
		if (r & 65) {
			let n = t.default;
			n && (n._c && (n._d = !1), Li(e, n()), n._c && (n._d = !0));
			return;
		}
		{
			n = 32;
			let r = t._;
			!r && !Wr(t) ? t._ctx = G : r === 3 && G && (G.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			Li(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: G
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [Pi(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function Ri(...e) {
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
function zi(e, t, n, r = null) {
	H(e, t, 7, [n, r]);
}
var Bi = Er(), Vi = 0;
function Hi(e, n, r) {
	let i = e.type, a = (n ? n.appContext : e.appContext) || Bi, o = {
		uid: Vi++,
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
		propsOptions: Xr(i, a),
		emitsOptions: Nr(i, a),
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
	return o.ctx = { _: o }, o.root = n ? n.root : o, o.emit = jr.bind(null, o), e.ce && e.ce(o), o;
}
var $ = null, Ui = () => $ || G, Wi, Gi;
{
	let e = le(), t = (t, n) => {
		let r;
		return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => {
			r.length > 1 ? r.forEach((t) => t(e)) : r[0](e);
		};
	};
	Wi = t("__VUE_INSTANCE_SETTERS__", (e) => $ = e), Gi = t("__VUE_SSR_SETTERS__", (e) => Yi = e);
}
var Ki = (e) => {
	let t = $;
	return Wi(e), e.scope.on(), () => {
		e.scope.off(), Wi(t);
	};
}, qi = () => {
	$ && $.scope.off(), Wi(null);
};
function Ji(e) {
	return e.vnode.shapeFlag & 4;
}
var Yi = !1;
function Xi(e, t = !1, n = !1) {
	t && Gi(t);
	let { props: r, children: i } = e.vnode, a = Ji(e);
	Gr(e, r, a, t), ii(e, i, n || t);
	let o = a ? Zi(e, t) : void 0;
	return t && Gi(!1), o;
}
function Zi(e, t) {
	let n = e.type;
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, ur);
	let { setup: r } = n;
	if (r) {
		Ue();
		let n = e.setupContext = r.length > 1 ? ta(e) : null, i = Ki(e), a = en(r, e, 0, [e.props, n]), o = y(a);
		if (We(), i(), (o || e.sp) && !Vn(e) && In(e), o) {
			if (a.then(qi, qi), t) return a.then((n) => {
				Gi(!0);
				try {
					Qi(e, n, t);
				} finally {
					Gi(!1);
				}
			}).catch((t) => {
				tn(t, e, 0);
			});
			e.asyncDep = a;
		} else Qi(e, a, t);
	} else $i(e, t);
}
function Qi(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) && (e.setupState = Gt(t)), $i(e, n);
}
function $i(e, t, n) {
	let i = e.type;
	e.render ||= i.render || r;
	{
		let t = Ki(e);
		Ue();
		try {
			pr(e);
		} finally {
			We(), t();
		}
	}
}
var ea = { get(e, t) {
	return P(e, "get", ""), e[t];
} };
function ta(e) {
	return {
		attrs: new Proxy(e.attrs, ea),
		slots: e.slots,
		emit: e.emit,
		expose: (t) => {
			e.exposed = t || {};
		}
	};
}
function na(e) {
	return e.exposed ? e.exposeProxy ||= new Proxy(Gt(zt(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in cr) return cr[n](e);
		},
		has(e, t) {
			return t in e || t in cr;
		}
	}) : e.proxy;
}
function ra(e) {
	return h(e) && "__vccOpts" in e;
}
var ia = (e, t) => /* @__PURE__ */ qt(e, t, Yi), aa = "3.5.43", oa = void 0, sa = typeof window < "u" && window.trustedTypes;
if (sa) try {
	oa = /* @__PURE__ */ sa.createPolicy("vue", { createHTML: (e) => e });
} catch {}
var ca = oa ? (e) => oa.createHTML(e) : (e) => e, la = "http://www.w3.org/2000/svg", ua = "http://www.w3.org/1998/Math/MathML", da = typeof document < "u" ? document : null, fa = da && /* @__PURE__ */ da.createElement("template"), pa = {
	insert: (e, t, n) => {
		t.insertBefore(e, n || null);
	},
	remove: (e) => {
		let t = e.parentNode;
		t && t.removeChild(e);
	},
	createElement: (e, t, n, r) => {
		let i = t === "svg" ? da.createElementNS(la, e) : t === "mathml" ? da.createElementNS(ua, e) : n ? da.createElement(e, { is: n }) : da.createElement(e);
		return e === "select" && r && r.multiple != null && i.setAttribute("multiple", r.multiple), i;
	},
	createText: (e) => da.createTextNode(e),
	createComment: (e) => da.createComment(e),
	setText: (e, t) => {
		e.nodeValue = t;
	},
	setElementText: (e, t) => {
		e.textContent = t;
	},
	parentNode: (e) => e.parentNode,
	nextSibling: (e) => e.nextSibling,
	querySelector: (e) => da.querySelector(e),
	setScopeId(e, t) {
		e.setAttribute(t, "");
	},
	insertStaticContent(e, t, n, r, i, a) {
		let o = n ? n.previousSibling : t.lastChild;
		if (i && (i === a || i.nextSibling)) for (; t.insertBefore(i.cloneNode(!0), n), i !== a && (i = i.nextSibling););
		else {
			fa.innerHTML = ca(r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e);
			let i = fa.content;
			if (r === "svg" || r === "mathml") {
				let e = i.firstChild;
				for (; e.firstChild;) i.appendChild(e.firstChild);
				i.removeChild(e);
			}
			t.insertBefore(i, n);
		}
		return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
	}
}, ma = /* @__PURE__ */ Symbol("_vtc");
function ha(e, t, n) {
	let r = e[ma];
	r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
var ga = /* @__PURE__ */ Symbol("_vod"), _a = /* @__PURE__ */ Symbol("_vsh"), va = /* @__PURE__ */ Symbol(""), ya = /(?:^|;)\s*display\s*:/;
function ba(e, t, n) {
	let r = e.style, i = g(n), a = !1;
	if (n && !i) {
		if (t) {
			if (g(t)) for (let e of t.split(";")) {
				let t = e.slice(0, e.indexOf(":")).trim();
				n[t] ?? Sa(r, t, "");
			}
			else for (let e in t) n[e] ?? Sa(r, e, "");
		}
		for (let i in n) {
			i === "display" && (a = !0);
			let o = n[i];
			o == null ? Sa(r, i, "") : Ea(e, i, !g(t) && t ? t[i] : void 0, o) || Sa(r, i, o);
		}
	} else if (i) {
		if (t !== n) {
			let e = r[va];
			e && (n += ";" + e), r.cssText = n, a = ya.test(n);
		}
	} else t && e.removeAttribute("style");
	ga in e && (e[ga] = a ? r.display : "", e[_a] && (r.display = "none"));
}
var xa = /\s*!important$/;
function Sa(e, t, n) {
	if (d(n)) n.forEach((n) => Sa(e, t, n));
	else if (n ??= "", t.startsWith("--")) xa.test(n) ? e.setProperty(t, n.replace(xa, ""), "important") : e.setProperty(t, n);
	else {
		let r = Ta(e, t);
		xa.test(n) ? e.setProperty(E(r), n.replace(xa, ""), "important") : e[r] = n;
	}
}
var Ca = [
	"Webkit",
	"Moz",
	"ms"
], wa = {};
function Ta(e, t) {
	let n = wa[t];
	if (n) return n;
	let r = T(t);
	if (r !== "filter" && r in e) return wa[t] = r;
	r = ie(r);
	for (let n = 0; n < Ca.length; n++) {
		let i = Ca[n] + r;
		if (i in e) return wa[t] = i;
	}
	return t;
}
function Ea(e, t, n, r) {
	return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && g(r) && n === r;
}
var Da = "http://www.w3.org/1999/xlink";
function Oa(e, t, n, r, i, a = ge(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(Da, t.slice(6, t.length)) : e.setAttributeNS(Da, t, n) : n == null || a && !_e(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
}
function ka(e, t, n, r, i) {
	if (t === "innerHTML" || t === "textContent") {
		n != null && (e[t] = t === "innerHTML" ? ca(n) : n);
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
function Aa(e, t, n, r) {
	e.addEventListener(t, n, r);
}
function ja(e, t, n, r) {
	e.removeEventListener(t, n, r);
}
var Ma = /* @__PURE__ */ Symbol("_vei");
function Na(e, t, n, r, i = null) {
	let a = e[Ma] || (e[Ma] = {}), o = a[t];
	if (r && o) o.value = r;
	else {
		let [n, s] = Ia(t);
		r ? Aa(e, n, a[t] = Ba(r, i), s) : o && (ja(e, n, o, s), a[t] = void 0);
	}
}
var Pa = /(Once|Passive|Capture)$/, Fa = /^on:?(?:Once|Passive|Capture)$/;
function Ia(e) {
	let t, n;
	for (; (n = e.match(Pa)) && !Fa.test(e);) t ||= {}, e = e.slice(0, e.length - n[1].length), t[n[1].toLowerCase()] = !0;
	return [e[2] === ":" ? e.slice(3) : E(e.slice(2)), t];
}
var La = 0, Ra = /* @__PURE__ */ Promise.resolve(), za = () => La ||= (Ra.then(() => La = 0), Date.now());
function Ba(e, t) {
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
				e && H(e, t, 5, a);
			}
		} else H(r, t, 5, [e]);
	};
	return n.value = e, n.attached = za(), n;
}
var Va = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Ha = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? ha(e, r, c) : t === "style" ? ba(e, n, r) : a(t) ? o(t) || Na(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), 1) : t[0] === "^" ? (t = t.slice(1), 0) : Ua(e, t, r, c)) ? (ka(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && Oa(e, t, r, c, s, t !== "value")) : e._isVueCE && (Wa(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? ka(e, T(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), Oa(e, t, r, c));
};
function Ua(e, t, n, r) {
	if (r) return !!(t === "innerHTML" || t === "textContent" || t in e && Va(t) && h(n));
	if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA") return !1;
	if (t === "width" || t === "height") {
		let t = e.tagName;
		if (t === "IMG" || t === "VIDEO" || t === "CANVAS" || t === "SOURCE") return !1;
	}
	return Va(t) && g(n) ? !1 : t in e;
}
function Wa(e, t) {
	let n = e._def.props;
	if (!n) return !1;
	let r = T(t);
	return Array.isArray(n) ? n.some((e) => T(e) === r) : Object.keys(n).some((e) => T(e) === r);
}
var Ga = /* @__PURE__ */ s({ patchProp: Ha }, pa), Ka;
function qa() {
	return Ka ||= oi(Ga);
}
var Ja = ((...e) => {
	let t = qa().createApp(...e), { mount: n } = t;
	return t.mount = (e) => {
		let r = Xa(e);
		if (!r) return;
		let i = t._component;
		!h(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
		let a = n(r, !1, Ya(r));
		return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), a;
	}, t;
});
function Ya(e) {
	if (e instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && e instanceof MathMLElement) return "mathml";
}
function Xa(e) {
	return g(e) ? document.querySelector(e) : e;
}
//#endregion
//#region src/lib/source-order.js
var Za = [
	"ddg",
	"bing",
	"so360",
	"baidu"
], Qa = {
	ddg: "DuckDuckGo",
	bing: "Bing",
	so360: "360 搜索",
	baidu: "百度"
}, $a = {
	ddg: "html/lite 端点 · 免 key · 基础回退源",
	bing: "cn.bing.com · 免 key · CJK 查询优先",
	so360: "so.com · 免 key",
	baidu: "baidu.com · 免 key · CJK 回退源"
}, eo = Object.fromEntries(Za.map((e) => [e, !0]));
function to(e) {
	let t = [];
	if (!Array.isArray(e)) return {
		ok: !1,
		errors: ["priority 必须是数组"]
	};
	e.length !== Za.length && t.push(`priority 长度必须为 ${Za.length}（四源全排列）`);
	for (let n of e) Za.includes(n) ? e.filter((e) => e === n).length !== 1 && t.push(`priority 重复源：${n}`) : t.push(`priority 含未知源：${String(n)}`);
	return {
		ok: t.length === 0,
		errors: t
	};
}
function no(e, t, n) {
	let r = [...e], i = r.indexOf(t), a = i + n;
	return i < 0 || a < 0 || a >= r.length || ([r[i], r[a]] = [r[a], r[i]]), r;
}
function ro(e, t) {
	return Za.includes(t) ? {
		...e,
		[t]: !e[t]
	} : { ...e };
}
function io(e) {
	return Za.filter((t) => e[t]).length;
}
function ao(e) {
	return io(e ?? {}) > 0 ? {
		ok: !0,
		errors: []
	} : {
		ok: !1,
		errors: ["至少启用一个搜索源（当前四源全关，web_search 将无源可用）"]
	};
}
//#endregion
//#region src/components/SourceCard.vue
var oo = {
	class: "cs-card",
	"aria-label": "源管理"
}, so = { class: "cs-card-head" }, co = { class: "cs-count" }, lo = { class: "cs-rows" }, uo = { class: "cs-order" }, fo = { class: "cs-row-main" }, po = { class: "cs-row-label" }, mo = { class: "cs-row-desc" }, ho = { class: "cs-row-control" }, go = ["disabled", "onClick"], _o = ["disabled", "onClick"], vo = [
	"aria-checked",
	"aria-label",
	"onClick"
], yo = { class: "cs-hint cs-error" }, bo = {
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
		error: {
			type: String,
			default: ""
		}
	},
	emits: ["change"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = ia(() => `${Za.length} 源 · 已启用 ${io(n.sources)}`);
		function a(e) {
			r("change", { sources: ro(n.sources, e) });
		}
		function o(e, t) {
			r("change", { priority: no(n.priority, e, t) });
		}
		return (t, n) => (X(), Z("section", oo, [
			Q("div", so, [n[0] ||= Q("h2", { class: "cs-card-title" }, "源管理", -1), Q("span", co, A(i.value), 1)]),
			n[2] ||= Q("p", { class: "cs-card-desc" }, " 按优先级自上而下回退；单源失败自动切换下一家，反爬/验证码命中即停不重试 ", -1),
			Q("div", lo, [(X(!0), Z(J, null, or(e.priority, (t, r) => (X(), Z("div", {
				key: t,
				class: "cs-row"
			}, [
				Q("span", uo, A(r + 1), 1),
				Q("div", fo, [Q("div", po, A(V(Qa)[t]), 1), Q("div", mo, A(V($a)[t]), 1)]),
				Q("div", ho, [
					Q("button", {
						class: "cs-step-btn",
						type: "button",
						disabled: r === 0,
						"aria-label": "上移一位",
						onClick: (e) => o(t, -1)
					}, "▲", 8, go),
					Q("button", {
						class: "cs-step-btn",
						type: "button",
						disabled: r === e.priority.length - 1,
						"aria-label": "下移一位",
						onClick: (e) => o(t, 1)
					}, "▼", 8, _o),
					Q("button", {
						class: k(["cs-switch", { "is-off": !e.sources[t] }]),
						type: "button",
						role: "switch",
						"aria-checked": String(!!e.sources[t]),
						"aria-label": `${V(Qa)[t]} 开关`,
						onClick: (e) => a(t)
					}, [...n[1] ||= [Q("span", { class: "cs-thumb" }, null, -1)]], 10, vo)
				])
			]))), 128))]),
			n[3] ||= Q("div", { class: "cs-hint" }, [Q("span", null, [
				Pi("▲▼ 调整优先级顺序（"),
				Q("code", null, "sources.priority"),
				Pi("）；开关对应 "),
				Q("code", null, "sources.<id>"),
				Pi("（ddg/bing/so360/baidu），任一源关闭即跳过")
			])], -1),
			Q("div", yo, A(e.error), 1)
		]));
	}
}, xo = [
	"timeoutMs",
	"retries",
	"chainBudgetMs",
	"maxResults",
	"cacheTtlMs",
	"egoBudget"
], So = {
	timeoutMs: 12e3,
	retries: 3,
	chainBudgetMs: 3e4,
	maxResults: 8,
	cacheTtlMs: 6e5,
	egoBudget: 15
}, Co = [
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
function wo(e) {
	return Math.min(10, Math.max(1, Number(e)));
}
var To = {
	min: 1,
	max: 10,
	step: 1
}, Eo = [
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
function Do(e) {
	return Math.round(e / 1e3);
}
function Oo(e) {
	return Math.round(Number(e) * 1e3);
}
function ko(e, t = {}) {
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
function Ao(e, t) {
	let n = Co.find((t) => t.key === e);
	if (!n) return {
		ok: !1,
		message: `未知预算字段：${e}`,
		value: null
	};
	if (e === "maxResults") {
		let e = ko(t, {
			...n,
			max: Infinity,
			label: n.label
		});
		return e.ok ? {
			ok: !0,
			message: "",
			value: wo(e.parsed)
		} : {
			ok: !1,
			message: e.message,
			value: null
		};
	}
	let r = ko(t, {
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
var jo = {
	class: "cs-card",
	"aria-label": "性能预算"
}, Mo = { class: "cs-rows" }, No = { class: "cs-row-main" }, Po = { class: "cs-row-label" }, Fo = { class: "cs-row-desc" }, Io = { class: "cs-row-control" }, Lo = [
	"min",
	"value",
	"aria-label",
	"onChange"
], Ro = { class: "cs-unit" }, zo = { class: "cs-row-note" }, Bo = { class: "cs-row-note cs-error" }, Vo = { class: "cs-row" }, Ho = { class: "cs-row-control cs-slider-wrap" }, Uo = [
	"min",
	"max",
	"step",
	"value"
], Wo = [
	"min",
	"max",
	"value"
], Go = { class: "cs-row-note cs-error" }, Ko = { class: "cs-row" }, qo = { class: "cs-row-control" }, Jo = ["value"], Yo = ["value"], Xo = { class: "cs-row-note cs-error" }, Zo = {
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
		let n = e, r = t, i = ia(() => Co.filter((e) => e.key === "timeoutMs" || e.key === "retries" || e.key === "chainBudgetMs" || e.key === "egoBudget"));
		function a(e) {
			return e === "timeoutMs" || e === "chainBudgetMs" ? Do(n.values[e]) : n.values[e];
		}
		function o(e, t) {
			let i = Ao(e, e === "timeoutMs" || e === "chainBudgetMs" ? Oo(t) : t);
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
				maxResults: wo(e),
				fieldError: { maxResults: "" }
			});
		}
		function c(e) {
			r("change", {
				cacheTtlMs: Number(e),
				fieldError: { cacheTtlMs: "" }
			});
		}
		return (t, n) => (X(), Z("section", jo, [
			n[7] ||= Q("div", { class: "cs-card-head" }, [Q("h2", { class: "cs-card-title" }, "性能预算"), Q("span", { class: "cs-count" }, "默认值 = R5 确认值")], -1),
			n[8] ||= Q("p", { class: "cs-card-desc" }, "超时/重试/整链预算为单调熔断守卫：整链超预算即中止并明示失败原因", -1),
			Q("div", Mo, [
				(X(!0), Z(J, null, or(i.value, (t) => (X(), Z("div", {
					key: t.key,
					class: "cs-row"
				}, [Q("div", No, [Q("div", Po, A(t.label), 1), Q("div", Fo, A(t.desc), 1)]), Q("div", Io, [
					Q("input", {
						class: "cs-num",
						type: "number",
						min: t.key === "timeoutMs" || t.key === "chainBudgetMs" ? 1 : t.min,
						value: a(t.key),
						"aria-label": t.label,
						onChange: (e) => o(t.key, e.target.value)
					}, null, 40, Lo),
					Q("span", Ro, A(t.unit), 1),
					Q("span", zo, A(t.key === "egoBudget" ? "上限守卫" : ""), 1),
					Q("span", Bo, A(e.errors[t.key] || ""), 1)
				])]))), 128)),
				Q("div", Vo, [n[5] ||= Q("div", { class: "cs-row-main" }, [Q("div", { class: "cs-row-label" }, "结果条数"), Q("div", { class: "cs-row-desc" }, "返回给模型的结果条数，clamp 1–10")], -1), Q("div", Ho, [
					Q("input", {
						class: "cs-range",
						type: "range",
						min: V(To).min,
						max: V(To).max,
						step: V(To).step,
						value: e.values.maxResults,
						"aria-label": "结果条数",
						onChange: n[0] ||= (e) => s(e.target.value)
					}, null, 40, Uo),
					Q("input", {
						class: "cs-num",
						type: "number",
						min: V(To).min,
						max: V(To).max,
						value: e.values.maxResults,
						"aria-label": "结果条数（数字）",
						onChange: n[1] ||= (e) => s(e.target.value)
					}, null, 40, Wo),
					n[3] ||= Q("span", { class: "cs-unit" }, "条", -1),
					n[4] ||= Q("span", { class: "cs-row-note" }, "1–10", -1),
					Q("span", Go, A(e.errors.maxResults || ""), 1)
				])]),
				Q("div", Ko, [n[6] ||= Q("div", { class: "cs-row-main" }, [Q("div", { class: "cs-row-label" }, "缓存 TTL"), Q("div", { class: "cs-row-desc" }, "LRU 50 条；命中缓存不发起网络请求")], -1), Q("div", qo, [Q("select", {
					class: "cs-select",
					value: e.values.cacheTtlMs,
					"aria-label": "缓存 TTL",
					onChange: n[2] ||= (e) => c(e.target.value)
				}, [(X(!0), Z(J, null, or(V(Eo), (e) => (X(), Z("option", {
					key: e.valueMs,
					value: e.valueMs
				}, A(e.label), 9, Yo))), 128))], 40, Jo), Q("span", Xo, A(e.errors.cacheTtlMs || ""), 1)])])
			]),
			n[9] ||= Q("div", { class: "cs-hint" }, [Q("span", null, [Pi("键面与 Config 一一对应："), Q("code", null, "timeoutMs / retries / chainBudgetMs / maxResults / cacheTtlMs / egoBudget")])], -1)
		]));
	}
}, Qo = [
	"auto",
	"force",
	"off"
], $o = "auto", es = [
	{
		value: "auto",
		label: "让位优先",
		hint: "profile 显式指定别家 provider 时只警告不接管（默认）"
	},
	{
		value: "force",
		label: "强制接管",
		hint: "覆盖别家 provider 强制接管 web_search（需显式选择）"
	},
	{
		value: "off",
		label: "禁用接管",
		hint: "不注册 provider、不动指针（K-10 关断态）"
	}
], ts = "隐私提示：出网请求体只含查询词与必要检索参数；vault / 记忆 / 会话上下文不出网；凭据仅以 env 名（credential-ref）引用，不落明文。";
function ns(e) {
	return Qo.includes(e) ? e : $o;
}
function rs(e, t) {
	return ns(e) === t;
}
//#endregion
//#region src/components/TakeoverCard.vue
var is = {
	class: "cs-card",
	"aria-label": "接管与隐私"
}, as = { class: "cs-rows" }, os = { class: "cs-row" }, ss = { class: "cs-row-control" }, cs = {
	class: "cs-seg",
	role: "radiogroup",
	"aria-label": "接管开关"
}, ls = [
	"aria-checked",
	"title",
	"onClick"
], us = { class: "cs-tip" }, ds = {
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
		return (e, t) => (X(), Z("section", is, [
			t[2] ||= Q("div", { class: "cs-card-head" }, [Q("h2", { class: "cs-card-title" }, "接管与隐私"), Q("span", { class: "cs-count" }, "默认：让位优先")], -1),
			t[3] ||= Q("p", { class: "cs-card-desc" }, " 接管语义（INV-10）：profile 显式指定别家 provider 时只警告不接管，强制需显式开启 ", -1),
			Q("div", as, [Q("div", os, [t[0] ||= Q("div", { class: "cs-row-main" }, [Q("div", { class: "cs-row-label" }, "接管开关"), Q("div", { class: "cs-row-desc" }, "与宿主 deepseek-official provider 的让位/接管行为")], -1), Q("div", ss, [Q("div", cs, [(X(!0), Z(J, null, or(V(es), (e) => (X(), Z("button", {
				key: e.value,
				class: k(["cs-seg-item", { "is-active": V(rs)(n.takeOver, e.value) }]),
				type: "button",
				role: "radio",
				"aria-checked": String(V(rs)(n.takeOver, e.value)),
				title: e.hint,
				onClick: (t) => i(e.value)
			}, A(e.label), 11, ls))), 128))])])])]),
			Q("div", us, [t[1] ||= Q("svg", {
				class: "cs-tip-icon",
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				"aria-hidden": "true"
			}, [Q("path", {
				d: "M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "1.2"
			})], -1), Q("p", null, A(V(ts)), 1)]),
			t[4] ||= Q("div", { class: "cs-hint" }, [Q("span", null, [
				Pi("三态映射 Config "),
				Q("code", null, "takeOver"),
				Pi("：auto=让位优先 · force=强制接管 · off=禁用接管")
			])], -1)
		]));
	}
}, fs = Object.freeze({
	sources: { ...eo },
	priority: [...Za],
	...So,
	takeOver: $o
}), ps = 8e3;
function ms(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.sources && typeof t.sources == "object" ? t.sources : {}, r = { ...eo };
	for (let e of Za) typeof n[e] == "boolean" && (r[e] = n[e]);
	let i = Array.isArray(n.priority) ? n.priority : t.priority, a = {
		sources: r,
		priority: Array.isArray(i) && to(i).ok ? [...i] : [...Za]
	};
	for (let e of xo) {
		let n = So[e], r = Number(t[e]);
		a[e] = Number.isFinite(r) ? e === "maxResults" ? wo(r) : Math.round(r) : n;
	}
	return a.takeOver = ns(t.takeOver), a;
}
function hs(e) {
	let t = ms(e);
	return {
		sources: {
			...t.sources,
			priority: [...t.priority]
		},
		timeoutMs: t.timeoutMs,
		retries: t.retries,
		chainBudgetMs: t.chainBudgetMs,
		maxResults: t.maxResults,
		cacheTtlMs: t.cacheTtlMs,
		egoBudget: t.egoBudget,
		takeOver: t.takeOver
	};
}
function gs(e) {
	let t = {}, n = ao(e?.sources);
	n.ok || (t.sources = n.errors[0]);
	let r = to(e?.priority);
	r.ok || (t.priority = r.errors[0]);
	for (let n of xo) {
		let r = Ao(n, e?.[n]);
		r.ok || (t[n] = r.message);
	}
	return {
		ok: Object.keys(t).length === 0,
		errors: t
	};
}
function _s(e = {}) {
	let { baseUrl: t = "api/dsh-clsh-search", fetchImpl: n = typeof fetch == "function" ? fetch : void 0, timeoutMs: r = ps } = e;
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
			if (!r.ok) throw Error(a?.error?.message ?? `设置请求失败（HTTP ${r.status}）`);
			if (a == null) throw Error(`设置响应不是有效 JSON（HTTP ${r.status}）`);
			return a;
		} finally {
			s && clearTimeout(s);
		}
	}
	return {
		async load() {
			return ms((await i("/settings"))?.data?.config);
		},
		async save(e) {
			let t = hs(e);
			return ms((await i("/settings", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(t)
			}, !1))?.data?.config ?? t);
		}
	};
}
//#endregion
//#region src/App.vue
var vs = { class: "cs-page" }, ys = { class: "cs-page-head" }, bs = { class: "cs-toolbar" }, xs = { class: "cs-chip" }, Ss = { class: "cs-page-foot cs-error" }, Cs = {
	__name: "App",
	props: { api: {
		type: Object,
		default: null
	} },
	setup(e) {
		let t = e, n = /* @__PURE__ */ Nt(ms(fs)), r = /* @__PURE__ */ Nt({}), i = /* @__PURE__ */ Vt(!0), a = /* @__PURE__ */ Vt(""), o = ia(() => i.value ? "已保存" : "未保存更改");
		function s(e) {
			let { fieldError: t, ...o } = e;
			Object.assign(n, ms({
				...hs(n),
				...o
			}));
			let s = gs(n);
			for (let e of Object.keys(r)) delete r[e];
			Object.assign(r, s.errors, t ?? {}), i.value = !1, a.value = "";
		}
		function c() {
			let e = gs(n);
			for (let e of Object.keys(r)) delete r[e];
			return Object.assign(r, e.errors), e;
		}
		async function l() {
			if (t.api && typeof t.api.load == "function") try {
				Object.assign(n, ms(await t.api.load())), i.value = !0, c();
			} catch (e) {
				a.value = e?.message ?? "设置加载失败";
			}
		}
		async function u() {
			if (!c().ok) {
				a.value = "设置有校验错误，未保存";
				return;
			}
			if (t.api && typeof t.api.save == "function") try {
				Object.assign(n, ms(await t.api.save(hs(n))));
			} catch (e) {
				a.value = e?.message ?? "设置保存失败";
				return;
			}
			i.value = !0, a.value = "";
		}
		return Xn(l), (e, t) => (X(), Z("main", vs, [
			Q("header", ys, [t[0] ||= Q("div", null, [Q("h1", { class: "cs-page-title" }, "dsh-clsh-search · 搜索设置"), Q("p", { class: "cs-page-intro" }, " 免 key 四源聚合（DDG → Bing → 360 → 百度）· 工具调用顺序：vault+记忆 → web_search → web_fetch → ego-browser 兜底 ")], -1), Q("div", bs, [Q("span", xs, A(o.value), 1), Q("button", {
				class: "cs-btn-primary",
				type: "button",
				onClick: u
			}, "保存更改")])]),
			Q("p", Ss, A(a.value), 1),
			Ai(bo, {
				sources: n.sources,
				priority: n.priority,
				error: r.sources || r.priority || "",
				onChange: s
			}, null, 8, [
				"sources",
				"priority",
				"error"
			]),
			Ai(Zo, {
				values: n,
				errors: r,
				onChange: s
			}, null, 8, ["values", "errors"]),
			Ai(ds, {
				"take-over": n.takeOver,
				onChange: s
			}, null, 8, ["take-over"]),
			t[1] ||= Q("p", { class: "cs-page-foot" }, [
				Pi(" 配置持久化：profile "),
				Q("code", null, "cordis.patch.yml"),
				Pi("（config 整行替换）· 数据落点 "),
				Q("code", null, "~/.dsh/cache/dsh-clsh-search/")
			], -1)
		]));
	}
}, ws = "data-dsh-clsh-search-style";
function Ts(e) {
	if (e.querySelector(`link[${ws}]`)) return;
	let t = e.createElement("link");
	t.rel = "stylesheet", t.href = new URL("./style.css", "" + import.meta.url).href, t.setAttribute(ws, ""), e.head.appendChild(t);
}
function Es(e, t = {}) {
	Ts(e.ownerDocument ?? document);
	let n = Ja(Cs, { api: t.api ?? _s({ baseUrl: t.apiBase }) });
	return n.mount(e), { unmount() {
		n.unmount();
	} };
}
var Ds = { mount: Es };
//#endregion
export { Ds as default, Es as mount };
