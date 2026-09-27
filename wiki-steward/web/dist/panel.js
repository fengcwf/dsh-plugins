//#region node_modules/.pnpm/@vue+shared@3.5.43/node_modules/@vue/shared/dist/shared.esm-bundler.js
// @__NO_SIDE_EFFECTS__
function e(e) {
	let t = /* @__PURE__ */ Object.create(null);
	for (let n of e.split(",")) t[n] = 1;
	return (e) => e in t;
}
var t = process.env.NODE_ENV === "production" ? {} : Object.freeze({}), n = process.env.NODE_ENV === "production" ? [] : Object.freeze([]), r = () => {}, i = () => !1, a = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), o = (e) => e.startsWith("onUpdate:"), s = Object.assign, c = (e, t) => {
	let n = e.indexOf(t);
	n > -1 && e.splice(n, 1);
}, l = Object.prototype.hasOwnProperty, u = (e, t) => l.call(e, t), d = Array.isArray, f = (e) => x(e) === "[object Map]", p = (e) => x(e) === "[object Set]", m = (e) => x(e) === "[object Date]", h = (e) => typeof e == "function", g = (e) => typeof e == "string", _ = (e) => typeof e == "symbol", v = (e) => typeof e == "object" && !!e, y = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch), b = Object.prototype.toString, x = (e) => b.call(e), S = (e) => x(e).slice(8, -1), C = (e) => x(e) === "[object Object]", w = (e) => g(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, ee = /* @__PURE__ */ e(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), te = /* @__PURE__ */ e("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"), ne = (e) => {
	let t = /* @__PURE__ */ Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, re = /-\w/g, T = ne((e) => e.replace(re, (e) => e.slice(1).toUpperCase())), ie = /\B([A-Z])/g, E = ne((e) => e.replace(ie, "-$1").toLowerCase()), ae = ne((e) => e.charAt(0).toUpperCase() + e.slice(1)), oe = ne((e) => e ? `on${ae(e)}` : ""), D = (e, t) => !Object.is(e, t), se = (e, ...t) => {
	for (let n = 0; n < e.length; n++) e[n](...t);
}, ce = (e, t, n, r = !1) => {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		writable: r,
		value: n
	});
}, O = (e) => {
	let t = parseFloat(e);
	return isNaN(t) ? e : t;
}, le, ue = () => le ||= typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {};
function de(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) {
			let r = e[n], i = g(r) ? he(r) : de(r);
			if (i) for (let e in i) t[e] = i[e];
		}
		return t;
	}
	if (g(e) || v(e)) return e;
}
var fe = /;(?![^(]*\))/g, pe = /:([^]+)/, me = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function he(e) {
	let t = {};
	return e.replace(me, (e) => e.startsWith("/*") ? "" : e).split(fe).forEach((e) => {
		if (e) {
			let n = e.split(pe);
			n.length > 1 && (t[n[0].trim()] = n[1].trim());
		}
	}), t;
}
function ge(e) {
	let t = "";
	if (g(e)) t = e;
	else if (d(e)) for (let n = 0; n < e.length; n++) {
		let r = ge(e[n]);
		r && (t += r + " ");
	}
	else if (v(e)) for (let n in e) e[n] && (t += n + " ");
	return t.trim();
}
var _e = "html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot", ve = "svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view", ye = "annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics", be = /* @__PURE__ */ e(_e), xe = /* @__PURE__ */ e(ve), Se = /* @__PURE__ */ e(ye), Ce = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", we = /* @__PURE__ */ e(Ce);
Ce + "";
function Te(e) {
	return !!e || e === "";
}
function Ee(e, t, n) {
	if (e.length !== t.length) return !1;
	let r = !0;
	for (let i = 0; r && i < e.length; i++) r = Ae(e[i], t[i], n);
	return r;
}
function De(e, t, n) {
	if (e.size !== t.size) return !1;
	let r = Array.from(t), i = new Uint8Array(r.length);
	for (let t of e) {
		let e = -1;
		for (let a = 0; a < r.length; a++) if (!i[a] && Ae(t, r[a], n)) {
			e = a;
			break;
		}
		if (e < 0) return !1;
		i[e] = 1;
	}
	return !0;
}
function Oe(e, t, n) {
	let r = f(e), i = f(t);
	if (r || i || (r = p(e), i = p(t), r || i)) return r && i ? De(e, t, n) : !1;
	if (Object.keys(e).length !== Object.keys(t).length) return !1;
	for (let r in e) {
		let i = e.hasOwnProperty(r), a = t.hasOwnProperty(r);
		if (i && !a || !i && a || !Ae(e[r], t[r], n)) return !1;
	}
	return String(e) === String(t);
}
function ke(e, t, n, r) {
	n ||= [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
	let [i, a] = n;
	if (i.has(e) || a.has(t)) return i.get(e) === t && a.get(t) === e;
	i.set(e, t), a.set(t, e);
	let o = r(e, t, n);
	return i.delete(e), a.delete(t), o;
}
function Ae(e, t, n) {
	if (e === t) return !0;
	let r = m(e), i = m(t);
	return r || i ? r && i ? e.getTime() === t.getTime() : !1 : (r = _(e), i = _(t), r || i ? e === t : (r = d(e), i = d(t), r || i ? r && i ? ke(e, t, n, Ee) : !1 : (r = v(e), i = v(t), r || i ? !r || !i ? !1 : ke(e, t, n, Oe) : String(e) === String(t))));
}
var je = (e) => !!(e && e.__v_isRef === !0), k = (e) => g(e) ? e : e == null ? "" : d(e) || v(e) && (e.toString === b || !h(e.toString)) ? je(e) ? k(e.value) : JSON.stringify(e, Me, 2) : String(e), Me = (e, t) => je(t) ? Me(e, t.value) : f(t) ? { [`Map(${t.size})`]: [...t.entries()].reduce((e, [t, n], r) => (e[Ne(t, r) + " =>"] = n, e), {}) } : p(t) ? { [`Set(${t.size})`]: [...t.values()].map((e) => Ne(e)) } : _(t) ? Ne(t) : v(t) && !d(t) && !C(t) ? String(t) : t, Ne = (e, t = "") => _(e) ? `Symbol(${e.description ?? t})` : e;
//#endregion
//#region node_modules/.pnpm/@vue+reactivity@3.5.43/node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
function Pe(e, ...t) {
	console.warn(`[Vue warn] ${e}`, ...t);
}
var A, Fe = class {
	constructor(e = !1) {
		this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && A && (A.active ? (this.parent = A, this.index = (A.scopes || (A.scopes = [])).push(this) - 1) : (this._active = !1, this._warnOnRun = !1));
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
			let t = A;
			try {
				return A = this, e();
			} finally {
				A = t;
			}
		} else process.env.NODE_ENV !== "production" && this._warnOnRun && Pe("cannot run an inactive effect scope.");
	}
	on() {
		++this._on === 1 && (this.prevScope = A, A = this);
	}
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (A === this) A = this.prevScope;
			else {
				let e = A;
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
function Ie() {
	return A;
}
var j, Le = /* @__PURE__ */ new WeakSet(), Re = class {
	constructor(e) {
		this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, A && (A.active ? A.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, Le.has(this) && (Le.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || He(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, $e(this), Ge(this);
		let e = j, t = M;
		j = this, M = !0;
		try {
			return this.fn();
		} finally {
			process.env.NODE_ENV !== "production" && j !== this && Pe("Active effect was not restored correctly - this is likely a Vue internal bug."), Ke(this), j = e, M = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) Ye(e);
			this.deps = this.depsTail = void 0, $e(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? Le.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		qe(this) && this.run();
	}
	get dirty() {
		return qe(this);
	}
}, ze = 0, Be, Ve;
function He(e, t = !1) {
	if (e.flags |= 8, t) {
		e.next = Ve, Ve = e;
		return;
	}
	e.next = Be, Be = e;
}
function Ue() {
	ze++;
}
function We() {
	if (--ze > 0) return;
	if (Ve) {
		let e = Ve;
		for (Ve = void 0; e;) {
			let t = e.next;
			e.next = void 0, e.flags &= -9, e = t;
		}
	}
	let e;
	for (; Be;) {
		let t = Be;
		for (Be = void 0; t;) {
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
function Ge(e) {
	for (let t = e.deps; t; t = t.nextDep) t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function Ke(e) {
	let t, n = e.depsTail, r = n;
	for (; r;) {
		let e = r.prevDep;
		r.version === -1 ? (r === n && (n = e), Ye(r), Xe(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e;
	}
	e.deps = t, e.depsTail = n;
}
function qe(e) {
	for (let t = e.deps; t; t = t.nextDep) if (t.dep.version !== t.version || t.dep.computed && (Je(t.dep.computed) || t.dep.version !== t.version)) return !0;
	return !!e._dirty;
}
function Je(e) {
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === et) || (e.globalVersion = et, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !qe(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = j, r = M;
	j = e, M = !0;
	try {
		Ge(e);
		let n = e.fn(e._value);
		(t.version === 0 || D(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		j = n, M = r, Ke(e), e.flags &= -3;
	}
}
function Ye(e, t = !1) {
	let { dep: n, prevSub: r, nextSub: i } = e;
	if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), process.env.NODE_ENV !== "production" && n.subsHead === e && (n.subsHead = i), n.subs === e && (n.subs = r, !r && n.computed)) {
		n.computed.flags &= -5;
		for (let e = n.computed.deps; e; e = e.nextDep) Ye(e, !0);
	}
	!t && !--n.sc && n.map && n.map.delete(n.key);
}
function Xe(e) {
	let { prevDep: t, nextDep: n } = e;
	t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
var M = !0, Ze = [];
function N() {
	Ze.push(M), M = !1;
}
function Qe() {
	let e = Ze.pop();
	M = e === void 0 || e;
}
function $e(e) {
	let { cleanup: t } = e;
	if (e.cleanup = void 0, t) {
		let e = j;
		j = void 0;
		try {
			t();
		} finally {
			j = e;
		}
	}
}
var et = 0, tt = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, nt = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0, process.env.NODE_ENV !== "production" && (this.subsHead = void 0);
	}
	track(e) {
		if (!j || !M || j === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== j) t = this.activeLink = new tt(j, this), j.deps ? (t.prevDep = j.depsTail, j.depsTail.nextDep = t, j.depsTail = t) : j.deps = j.depsTail = t, rt(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = j.depsTail, t.nextDep = void 0, j.depsTail.nextDep = t, j.depsTail = t, j.deps === t && (j.deps = e);
		}
		return process.env.NODE_ENV !== "production" && j.onTrack && j.onTrack(s({ effect: j }, e)), t;
	}
	trigger(e) {
		this.version++, et++, this.notify(e);
	}
	notify(e) {
		Ue();
		try {
			if (process.env.NODE_ENV !== "production") for (let t = this.subsHead; t; t = t.nextSub) t.sub.onTrigger && !(t.sub.flags & 8) && t.sub.onTrigger(s({ effect: t.sub }, e));
			for (let e = this.subs; e; e = e.prevSub) e.sub.notify() && e.sub.dep.notify();
		} finally {
			We();
		}
	}
};
function rt(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) rt(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), process.env.NODE_ENV !== "production" && e.dep.subsHead === void 0 && (e.dep.subsHead = e), e.dep.subs = e;
	}
}
var it = /* @__PURE__ */ new WeakMap(), at = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Object iterate"), ot = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Map keys iterate"), st = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Array iterate");
function P(e, t, n) {
	if (M && j) {
		let r = it.get(e);
		r || it.set(e, r = /* @__PURE__ */ new Map());
		let i = r.get(n);
		i || (r.set(n, i = new nt()), i.map = r, i.key = n), process.env.NODE_ENV === "production" ? i.track() : i.track({
			target: e,
			type: t,
			key: n
		});
	}
}
function ct(e, t, n, r, i, a) {
	let o = it.get(e);
	if (!o) {
		et++;
		return;
	}
	let s = (o) => {
		o && (process.env.NODE_ENV === "production" ? o.trigger() : o.trigger({
			target: e,
			type: t,
			key: n,
			newValue: r,
			oldValue: i,
			oldTarget: a
		}));
	};
	if (Ue(), t === "clear") o.forEach(s);
	else {
		let i = d(e), a = i && w(n);
		if (i && n === "length") {
			let e = Number(r);
			o.forEach((t, n) => {
				(n === "length" || n === st || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get(st)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(at)), f(e) && s(o.get(ot)));
				break;
			case "delete":
				i || (s(o.get(at)), f(e) && s(o.get(ot)));
				break;
			case "set": f(e) && s(o.get(at));
		}
	}
	We();
}
function lt(e) {
	let t = /* @__PURE__ */ L(e);
	return t === e || (P(t, "iterate", st), /* @__PURE__ */ I(e)) ? t : /* @__PURE__ */ F(e) ? /* @__PURE__ */ Xt(e) ? t.map((e) => $t(R(e))) : t.map($t) : t.map(R);
}
function ut(e) {
	return P(e = /* @__PURE__ */ L(e), "iterate", st), e;
}
function dt(e, t) {
	return /* @__PURE__ */ F(e) ? $t(/* @__PURE__ */ Xt(e) ? R(t) : t) : R(t);
}
var ft = {
	__proto__: null,
	[Symbol.iterator]() {
		return pt(this, Symbol.iterator, (e) => dt(this, e));
	},
	concat(...e) {
		return lt(this).concat(...e.map((e) => d(e) ? lt(e) : e));
	},
	entries() {
		return pt(this, "entries", (e) => (e[1] = dt(this, e[1]), e));
	},
	every(e, t) {
		return ht(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return ht(this, "filter", e, t, (e) => e.map((e) => dt(this, e)), arguments);
	},
	find(e, t) {
		return ht(this, "find", e, t, (e) => dt(this, e), arguments);
	},
	findIndex(e, t) {
		return ht(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return ht(this, "findLast", e, t, (e) => dt(this, e), arguments);
	},
	findLastIndex(e, t) {
		return ht(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return ht(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return _t(this, "includes", e);
	},
	indexOf(...e) {
		return _t(this, "indexOf", e);
	},
	join(e) {
		return lt(this).join(e);
	},
	lastIndexOf(...e) {
		return _t(this, "lastIndexOf", e);
	},
	map(e, t) {
		return ht(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return vt(this, "pop");
	},
	push(...e) {
		return vt(this, "push", e);
	},
	reduce(e, ...t) {
		return gt(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return gt(this, "reduceRight", e, t);
	},
	shift() {
		return vt(this, "shift");
	},
	some(e, t) {
		return ht(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return vt(this, "splice", e);
	},
	toReversed() {
		return lt(this).toReversed();
	},
	toSorted(e) {
		return lt(this).toSorted(e);
	},
	toSpliced(...e) {
		return lt(this).toSpliced(...e);
	},
	unshift(...e) {
		return vt(this, "unshift", e);
	},
	values() {
		return pt(this, "values", (e) => dt(this, e));
	}
};
function pt(e, t, n) {
	let r = ut(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ I(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var mt = Array.prototype;
function ht(e, t, n, r, i, a) {
	let o = ut(e), s = o !== e && !/* @__PURE__ */ I(e), c = o[t];
	if (c !== mt[t]) {
		let t = c.apply(e, a);
		return s ? R(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, dt(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function gt(e, t, n, r) {
	let i = ut(e), a = i !== e && !/* @__PURE__ */ I(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = dt(e, t)), n.call(this, t, dt(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? dt(e, c) : c;
}
function _t(e, t, n) {
	let r = /* @__PURE__ */ L(e);
	P(r, "iterate", st);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ Zt(n[0]) ? (n[0] = /* @__PURE__ */ L(n[0]), r[t](...n)) : i;
}
function vt(e, t, n = []) {
	N(), Ue();
	let r = (/* @__PURE__ */ L(e))[t].apply(e, n);
	return We(), Qe(), r;
}
var yt = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), bt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function xt(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ L(this);
	return P(t, "has", e), t.hasOwnProperty(e);
}
var St = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? Ut : Ht : i ? Vt : Bt).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = ft[t])) return e;
			if (t === "hasOwnProperty") return xt;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ z(e) ? e : n);
		if ((_(t) ? bt.has(t) : yt(t)) || (r || P(e, "get", t), i)) return o;
		if (/* @__PURE__ */ z(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ qt(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ qt(o) : /* @__PURE__ */ Gt(o) : o;
	}
}, Ct = class extends St {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let r = /* @__PURE__ */ F(i);
			if (!/* @__PURE__ */ I(n) && !/* @__PURE__ */ F(n) && (i = /* @__PURE__ */ L(i), n = /* @__PURE__ */ L(n)), !a && /* @__PURE__ */ z(i) && !/* @__PURE__ */ z(n)) return r ? (process.env.NODE_ENV !== "production" && Pe(`Set operation on key "${String(t)}" failed: target is readonly.`, e[t]), !0) : (i.value = n, !0);
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ z(e) ? e : r);
		return e === /* @__PURE__ */ L(r) && s && (o ? D(n, i) && ct(e, "set", t, n, i) : ct(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && ct(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !bt.has(t)) && P(e, "has", t), n;
	}
	ownKeys(e) {
		return P(e, "iterate", d(e) ? "length" : at), Reflect.ownKeys(e);
	}
}, wt = class extends St {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return process.env.NODE_ENV !== "production" && Pe(`Set operation on key "${String(t)}" failed: target is readonly.`, e), !0;
	}
	deleteProperty(e, t) {
		return process.env.NODE_ENV !== "production" && Pe(`Delete operation on key "${String(t)}" failed: target is readonly.`, e), !0;
	}
}, Tt = /* @__PURE__ */ new Ct(), Et = /* @__PURE__ */ new wt(), Dt = /* @__PURE__ */ new Ct(!0), Ot = /* @__PURE__ */ new wt(!0), kt = (e) => e, At = (e) => Reflect.getPrototypeOf(e);
function jt(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ L(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? kt : t ? $t : R;
		return !t && P(a, "iterate", l ? ot : at), s(Object.create(u), { next() {
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
function Mt(e) {
	return function(...t) {
		if (process.env.NODE_ENV !== "production") {
			let n = t[0] ? `on key "${t[0]}" ` : "";
			Pe(`${ae(e)} operation ${n}failed: target is readonly.`, /* @__PURE__ */ L(this));
		}
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function Nt(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ L(r), a = /* @__PURE__ */ L(n);
			e || (D(n, a) && P(i, "get", n), P(i, "get", a));
			let { has: o } = At(i), s = t ? kt : e ? $t : R;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && P(/* @__PURE__ */ L(t), "iterate", at), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ L(n), i = /* @__PURE__ */ L(t);
			return e || (D(t, i) && P(r, "has", t), P(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ L(a), s = t ? kt : e ? $t : R;
			return !e && P(o, "iterate", at), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: Mt("add"),
		set: Mt("set"),
		delete: Mt("delete"),
		clear: Mt("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ L(this), r = At(n), i = /* @__PURE__ */ L(e), a = !t && !/* @__PURE__ */ I(e) && !/* @__PURE__ */ F(e) ? i : e;
			return r.has.call(n, a) || D(e, a) && r.has.call(n, e) || D(i, a) && r.has.call(n, i) || (n.add(a), ct(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ I(n) && !/* @__PURE__ */ F(n) && (n = /* @__PURE__ */ L(n));
			let r = /* @__PURE__ */ L(this), { has: i, get: a } = At(r), o = i.call(r, e);
			o ? process.env.NODE_ENV !== "production" && zt(r, i, e) : (e = /* @__PURE__ */ L(e), o = i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? D(n, s) && ct(r, "set", e, n, s) : ct(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ L(this), { has: n, get: r } = At(t), i = n.call(t, e);
			i ? process.env.NODE_ENV !== "production" && zt(t, n, e) : (e = /* @__PURE__ */ L(e), i = n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && ct(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ L(this), t = e.size !== 0, n = process.env.NODE_ENV === "production" ? void 0 : f(e) ? new Map(e) : new Set(e), r = e.clear();
			return t && ct(e, "clear", void 0, void 0, n), r;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = jt(r, e, t);
	}), n;
}
function Pt(e, t) {
	let n = Nt(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var Ft = { get: /* @__PURE__ */ Pt(!1, !1) }, It = { get: /* @__PURE__ */ Pt(!1, !0) }, Lt = { get: /* @__PURE__ */ Pt(!0, !1) }, Rt = { get: /* @__PURE__ */ Pt(!0, !0) };
function zt(e, t, n) {
	let r = /* @__PURE__ */ L(n);
	if (r !== n && t.call(e, r)) {
		let t = S(e);
		Pe(`Reactive ${t} contains both the raw and reactive versions of the same object${t === "Map" ? " as keys" : ""}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
	}
}
var Bt = /* @__PURE__ */ new WeakMap(), Vt = /* @__PURE__ */ new WeakMap(), Ht = /* @__PURE__ */ new WeakMap(), Ut = /* @__PURE__ */ new WeakMap();
function Wt(e) {
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
function Gt(e) {
	return /* @__PURE__ */ F(e) ? e : Yt(e, !1, Tt, Ft, Bt);
}
// @__NO_SIDE_EFFECTS__
function Kt(e) {
	return Yt(e, !1, Dt, It, Vt);
}
// @__NO_SIDE_EFFECTS__
function qt(e) {
	return Yt(e, !0, Et, Lt, Ht);
}
// @__NO_SIDE_EFFECTS__
function Jt(e) {
	return Yt(e, !0, Ot, Rt, Ut);
}
function Yt(e, t, n, r, i) {
	if (!v(e)) return process.env.NODE_ENV !== "production" && Pe(`value cannot be made ${t ? "readonly" : "reactive"}: ${String(e)}`), e;
	if (e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = Wt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Xt(e) {
	return /* @__PURE__ */ F(e) ? /* @__PURE__ */ Xt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function F(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function Zt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function L(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ L(t) : e;
}
function Qt(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && ce(e, "__v_skip", !0), e;
}
var R = (e) => v(e) ? /* @__PURE__ */ Gt(e) : e, $t = (e) => v(e) ? /* @__PURE__ */ qt(e) : e;
// @__NO_SIDE_EFFECTS__
function z(e) {
	return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function en(e) {
	return tn(e, !1);
}
function tn(e, t) {
	return /* @__PURE__ */ z(e) ? e : new nn(e, t);
}
var nn = class {
	constructor(e, t) {
		this.dep = new nt(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : /* @__PURE__ */ L(e), this._value = t ? e : R(e), this.__v_isShallow = t;
	}
	get value() {
		return process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		}), this._value;
	}
	set value(e) {
		let t = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ I(e) || /* @__PURE__ */ F(e);
		e = n ? e : /* @__PURE__ */ L(e), D(e, t) && (this._rawValue = e, this._value = n ? e : R(e), process.env.NODE_ENV === "production" ? this.dep.trigger() : this.dep.trigger({
			target: this,
			type: "set",
			key: "value",
			newValue: e,
			oldValue: t
		}));
	}
};
function rn(e) {
	return /* @__PURE__ */ z(e) ? e.value : e;
}
var an = {
	get: (e, t, n) => t === "__v_raw" ? e : rn(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ z(i) && !/* @__PURE__ */ z(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function on(e) {
	return /* @__PURE__ */ Xt(e) ? e : new Proxy(e, an);
}
var sn = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new nt(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = et - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && j !== this) return He(this, !0), !0;
		process.env.NODE_ENV;
	}
	get value() {
		let e = process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		});
		return Je(this), e && (e.version = this.dep.version), this._value;
	}
	set value(e) {
		this.setter ? this.setter(e) : process.env.NODE_ENV !== "production" && Pe("Write operation failed: computed value is readonly");
	}
};
// @__NO_SIDE_EFFECTS__
function cn(e, t, n = !1) {
	let r, i;
	h(e) ? r = e : (r = e.get, i = e.set);
	let a = new sn(r, i, n);
	return process.env.NODE_ENV !== "production" && t && !n && (a.onTrack = t.onTrack, a.onTrigger = t.onTrigger), a;
}
var ln = {}, un = /* @__PURE__ */ new WeakMap(), dn = void 0;
function fn(e, t = !1, n = dn) {
	if (n) {
		let t = un.get(n);
		t || un.set(n, t = []), t.push(e);
	} else process.env.NODE_ENV !== "production" && !t && Pe("onWatcherCleanup() was called when there was no active watcher to associate with.");
}
function pn(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => {
		(i.onWarn || Pe)("Invalid watch source: ", e, "A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.");
	}, m = (e) => o ? e : /* @__PURE__ */ I(e) || o === !1 || o === 0 ? mn(e, 1) : mn(e), g, _, v, y, b = !1, x = !1;
	if (/* @__PURE__ */ z(e) ? (_ = () => e.value, b = /* @__PURE__ */ I(e)) : /* @__PURE__ */ Xt(e) ? (_ = () => m(e), b = !0) : d(e) ? (x = !0, b = e.some((e) => /* @__PURE__ */ Xt(e) || /* @__PURE__ */ I(e)), _ = () => e.map((e) => {
		if (/* @__PURE__ */ z(e)) return e.value;
		if (/* @__PURE__ */ Xt(e)) return m(e);
		if (h(e)) return f ? f(e, 2) : e();
		process.env.NODE_ENV !== "production" && p(e);
	})) : h(e) ? _ = n ? f ? () => f(e, 2) : e : () => {
		if (v) {
			N();
			try {
				v();
			} finally {
				Qe();
			}
		}
		let t = dn;
		dn = g;
		try {
			return f ? f(e, 3, [y]) : e(y);
		} finally {
			dn = t;
		}
	} : (_ = r, process.env.NODE_ENV !== "production" && p(e)), n && o) {
		let e = _, t = o === !0 ? Infinity : o;
		_ = () => mn(e(), t);
	}
	let S = Ie(), C = () => {
		g.stop(), S && S.active && c(S.effects, g);
	};
	if (s && n) {
		let e = n;
		n = (...t) => {
			let n = e(...t);
			return C(), n;
		};
	}
	let w = x ? Array(e.length).fill(ln) : ln, ee = (e) => {
		if (g.flags & 1 && (g.dirty || e)) {
			if (n) {
				let t = g.run();
				if (e || o || b || (x ? t.some((e, t) => D(e, w[t])) : D(t, w))) {
					v && v();
					let e = dn;
					dn = g;
					try {
						let e = [
							t,
							w === ln ? void 0 : x && w[0] === ln ? [] : w,
							y
						];
						w = t, f ? f(n, 3, e) : n(...e);
					} finally {
						dn = e;
					}
				}
			} else g.run();
		}
	};
	return u && u(ee), g = new Re(_), g.scheduler = l ? () => l(ee, !1) : ee, y = (e) => fn(e, !1, g), v = g.onStop = () => {
		let e = un.get(g);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			un.delete(g);
		}
	}, process.env.NODE_ENV !== "production" && (g.onTrack = i.onTrack, g.onTrigger = i.onTrigger), n ? a ? ee(!0) : w = g.run() : l ? l(ee.bind(null, !0), !0) : g.run(), C.pause = g.pause.bind(g), C.resume = g.resume.bind(g), C.stop = C, C;
}
function mn(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ z(e)) mn(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) mn(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		mn(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) mn(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && mn(e[r], t, n);
	}
	return e;
}
//#endregion
//#region node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
var hn = [];
function gn(e) {
	hn.push(e);
}
function _n() {
	hn.pop();
}
var vn = !1;
function B(e, ...t) {
	if (vn) return;
	vn = !0, N();
	let n = hn.length ? hn[hn.length - 1].component : null, r = n && n.appContext.config.warnHandler, i = yn();
	if (r) Tn(r, n, 11, [
		e + t.map((e) => e.toString?.call(e) ?? JSON.stringify(e)).join(""),
		n && n.proxy,
		i.map(({ vnode: e }) => `at <${Go(n, e.type)}>`).join("\n"),
		i
	]);
	else {
		let n = [`[Vue warn]: ${e}`, ...t];
		i.length && n.push("\n", ...bn(i)), console.warn(...n);
	}
	Qe(), vn = !1;
}
function yn() {
	let e = hn[hn.length - 1];
	if (!e) return [];
	let t = [];
	for (; e;) {
		let n = t[0];
		n && n.vnode === e ? n.recurseCount++ : t.push({
			vnode: e,
			recurseCount: 0
		});
		let r = e.component && e.component.parent;
		e = r && r.vnode;
	}
	return t;
}
function bn(e) {
	let t = [];
	return e.forEach((e, n) => {
		t.push(...n === 0 ? [] : ["\n"], ...xn(e));
	}), t;
}
function xn({ vnode: e, recurseCount: t }) {
	let n = t > 0 ? `... (${t} recursive calls)` : "", r = e.component ? e.component.parent == null : !1, i = ` at <${Go(e.component, e.type, r)}`, a = ">" + n;
	return e.props ? [
		i,
		...Sn(e.props),
		a
	] : [i + a];
}
function Sn(e) {
	let t = [], n = Object.keys(e);
	return n.slice(0, 3).forEach((n) => {
		t.push(...Cn(n, e[n]));
	}), n.length > 3 && t.push(" ..."), t;
}
function Cn(e, t, n) {
	return g(t) ? (t = JSON.stringify(t), n ? t : [`${e}=${t}`]) : typeof t == "number" || typeof t == "boolean" || t == null ? n ? t : [`${e}=${t}`] : /* @__PURE__ */ z(t) ? (t = Cn(e, /* @__PURE__ */ L(t.value), !0), n ? t : [
		`${e}=Ref<`,
		t,
		">"
	]) : h(t) ? [`${e}=fn${t.name ? `<${t.name}>` : ""}`] : (t = /* @__PURE__ */ L(t), n ? t : [`${e}=`, t]);
}
var wn = {
	sp: "serverPrefetch hook",
	bc: "beforeCreate hook",
	c: "created hook",
	bm: "beforeMount hook",
	m: "mounted hook",
	bu: "beforeUpdate hook",
	u: "updated",
	bum: "beforeUnmount hook",
	um: "unmounted hook",
	a: "activated hook",
	da: "deactivated hook",
	ec: "errorCaptured hook",
	rtc: "renderTracked hook",
	rtg: "renderTriggered hook",
	0: "setup function",
	1: "render function",
	2: "watcher getter",
	3: "watcher callback",
	4: "watcher cleanup function",
	5: "native event handler",
	6: "component event handler",
	7: "vnode hook",
	8: "directive hook",
	9: "transition hook",
	10: "app errorHandler",
	11: "app warnHandler",
	12: "ref function",
	13: "async component loader",
	14: "scheduler flush",
	15: "component update",
	16: "app unmount cleanup function"
};
function Tn(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		Dn(e, t, n);
	}
}
function En(e, t, n, r) {
	if (h(e)) {
		let i = Tn(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			Dn(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(En(e[a], t, n, r));
		return i;
	}
	process.env.NODE_ENV !== "production" && B(`Invalid value type passed to callWithAsyncErrorHandling(): ${typeof e}`);
}
function Dn(e, n, r, i = !0) {
	let a = n ? n.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: s } = n && n.appContext.config || t;
	if (n) {
		let t = n.parent, i = n.proxy, a = process.env.NODE_ENV === "production" ? `https://vuejs.org/error-reference/#runtime-${r}` : wn[r];
		for (; t;) {
			let n = t.ec;
			if (n) {
				for (let t = 0; t < n.length; t++) if (n[t](e, i, a) === !1) return;
			}
			t = t.parent;
		}
		if (o) {
			N(), Tn(o, null, 10, [
				e,
				i,
				a
			]), Qe();
			return;
		}
	}
	On(e, r, a, i, s);
}
function On(e, t, n, r = !0, i = !1) {
	if (process.env.NODE_ENV !== "production") {
		let i = wn[t];
		if (n && gn(n), B(`Unhandled error${i ? ` during execution of ${i}` : ""}`), n && _n(), r) throw e;
		console.error(e);
	} else if (i) throw e;
	else console.error(e);
}
var V = [], kn = -1, An = [], jn = null, Mn = 0, Nn = /* @__PURE__ */ Promise.resolve(), Pn = null, Fn = 100;
function In(e) {
	let t = Pn || Nn;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function Ln(e) {
	let t = kn + 1, n = V.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = V[r], a = Un(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function Rn(e) {
	if (!(e.flags & 1)) {
		let t = Un(e), n = V[V.length - 1];
		!n || !(e.flags & 2) && t >= Un(n) ? V.push(e) : V.splice(Ln(t), 0, e), e.flags |= 1, zn();
	}
}
function zn() {
	Pn ||= Nn.then(Wn);
}
function Bn(e) {
	if (!d(e)) jn && e.id === -1 ? jn.splice(Mn + 1, 0, e) : e.flags & 1 || (An.push(e), e.flags |= 1);
	else for (let t = 0; t < e.length; t++) An.push(e[t]);
	zn();
}
function Vn(e, t, n = kn + 1) {
	for (process.env.NODE_ENV !== "production" && (t ||= /* @__PURE__ */ new Map()); n < V.length; n++) {
		let r = V[n];
		if (r && r.flags & 2) {
			if (e && r.id !== e.uid || process.env.NODE_ENV !== "production" && Gn(t, r)) continue;
			V.splice(n, 1), n--, r.flags & 4 && (r.flags &= -2), r(), r.flags & 4 || (r.flags &= -2);
		}
	}
}
function Hn(e) {
	if (An.length) {
		let t = [...new Set(An)].sort((e, t) => Un(e) - Un(t));
		if (An.length = 0, jn) {
			for (let e = 0; e < t.length; e++) jn.push(t[e]);
			return;
		}
		for (jn = t, process.env.NODE_ENV !== "production" && (e ||= /* @__PURE__ */ new Map()), Mn = 0; Mn < jn.length; Mn++) {
			let t = jn[Mn];
			process.env.NODE_ENV !== "production" && Gn(e, t) || (t.flags & 4 && (t.flags &= -2), t.flags & 8 || t(), t.flags &= -2);
		}
		jn = null, Mn = 0;
	}
}
var Un = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function Wn(e) {
	process.env.NODE_ENV !== "production" && (e ||= /* @__PURE__ */ new Map());
	let t = process.env.NODE_ENV === "production" ? r : (t) => Gn(e, t);
	try {
		for (kn = 0; kn < V.length; kn++) {
			let e = V[kn];
			if (e && !(e.flags & 8)) {
				if (process.env.NODE_ENV !== "production" && t(e)) continue;
				e.flags & 4 && (e.flags &= -2), Tn(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2);
			}
		}
	} finally {
		for (; kn < V.length; kn++) {
			let e = V[kn];
			e && (e.flags &= -2);
		}
		kn = -1, V.length = 0, Hn(e), Pn = null, (V.length || An.length) && Wn(e);
	}
}
function Gn(e, t) {
	let n = e.get(t) || 0;
	if (n > Fn) {
		let e = t.i, n = e && Wo(e.type);
		return Dn(`Maximum recursive updates exceeded${n ? ` in component <${n}>` : ""}. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself. Possible sources include component template, render function, updated hook or watcher source function.`, null, 10), !0;
	}
	return e.set(t, n + 1), !1;
}
var H = !1, Kn = (e) => {
	try {
		return H;
	} finally {
		H = e;
	}
}, qn = /* @__PURE__ */ new Map();
process.env.NODE_ENV !== "production" && (ue().__VUE_HMR_RUNTIME__ = {
	createRecord: nr(Zn),
	rerender: nr($n),
	reload: nr(er)
});
var Jn = /* @__PURE__ */ new Map();
function Yn(e) {
	let t = e.type.__hmrId, n = Jn.get(t);
	n ||= (Zn(t, e.type), Jn.get(t)), n.instances.add(e);
}
function Xn(e) {
	Jn.get(e.type.__hmrId).instances.delete(e);
}
function Zn(e, t) {
	return !Jn.has(e) && (Jn.set(e, {
		initialDef: Qn(t),
		instances: /* @__PURE__ */ new Set()
	}), !0);
}
function Qn(e) {
	return Ko(e) ? e.__vccOpts : e;
}
function $n(e, t) {
	let n = Jn.get(e);
	n && (n.initialDef.render = t, [...n.instances].forEach((e) => {
		t && (e.render = t, Qn(e.type).render = t), e.renderCache = [], H = !0, e.job.flags & 8 || e.update(), H = !1;
	}));
}
function er(e, t) {
	let n = Jn.get(e);
	if (!n) return;
	t = Qn(t), tr(n.initialDef, t);
	let r = [...n.instances];
	for (let e = 0; e < r.length; e++) {
		let i = r[e], a = Qn(i.type), o = qn.get(a);
		o || (a !== n.initialDef && tr(a, t), qn.set(a, o = /* @__PURE__ */ new Set())), o.add(i), i.appContext.propsCache.delete(i.type), i.appContext.emitsCache.delete(i.type), i.appContext.optionsCache.delete(i.type), i.ceReload ? (o.add(i), i.ceReload(t.styles), o.delete(i)) : i.parent ? Rn(() => {
			i.job.flags & 8 || (H = !0, i.parent.update(), H = !1, o.delete(i));
		}) : i.appContext.reload ? i.appContext.reload() : typeof window < "u" ? window.location.reload() : console.warn("[HMR] Root or manually mounted instance modified. Full reload required."), i.root.ce && i !== i.root && i.root.ce._removeChildStyle(a);
	}
	Bn(() => {
		qn.clear();
	});
}
function tr(e, t) {
	s(e, t);
	for (let n in e) n !== "__file" && !(n in t) && delete e[n];
}
function nr(e) {
	return (t, n) => {
		try {
			return e(t, n);
		} catch (e) {
			console.error(e), console.warn("[HMR] Something went wrong during Vue component hot-reload. Full reload required.");
		}
	};
}
var rr, ir = [], ar = !1;
function or(e, ...t) {
	rr ? rr.emit(e, ...t) : ar || ir.push({
		event: e,
		args: t
	});
}
function sr(e, t) {
	rr = e, rr ? (rr.enabled = !0, ir.forEach(({ event: e, args: t }) => rr.emit(e, ...t)), ir = []) : typeof window < "u" && window.HTMLElement && !(window.navigator?.userAgent)?.includes("jsdom") ? ((t.__VUE_DEVTOOLS_HOOK_REPLAY__ = t.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((e) => {
		sr(e, t);
	}), setTimeout(() => {
		rr || (t.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, ar = !0, ir = []);
	}, 3e3)) : (ar = !0, ir = []);
}
function cr(e, t) {
	or("app:init", e, t, {
		Fragment: K,
		Text: Ya,
		Comment: q,
		Static: Xa
	});
}
function lr(e) {
	or("app:unmount", e);
}
var ur = /* @__PURE__ */ mr("component:added"), dr = /* @__PURE__ */ mr("component:updated"), fr = /* @__PURE__ */ mr("component:removed"), pr = (e) => {
	rr && typeof rr.cleanupBuffer == "function" && !rr.cleanupBuffer(e) && fr(e);
};
// @__NO_SIDE_EFFECTS__
function mr(e) {
	return (t) => {
		or(e, t.appContext.app, t.uid, t.parent ? t.parent.uid : void 0, t);
	};
}
var hr = /* @__PURE__ */ _r("perf:start"), gr = /* @__PURE__ */ _r("perf:end");
function _r(e) {
	return (t, n, r) => {
		or(e, t.appContext.app, t.uid, t, n, r);
	};
}
function vr(e, t, n) {
	or("component:emit", e.appContext.app, e, t, n);
}
var U = null, yr = null;
function br(e) {
	let t = U;
	return U = e, yr = e && e.type.__scopeId || null, t;
}
function xr(e, t = U, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && eo(-1);
		let i = br(t), a = Za.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = Za.length; e > a; e--) Qa();
			br(i), r._d && eo(1);
		}
		return process.env.NODE_ENV !== "production" && dr(t), o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function Sr(e) {
	te(e) && B("Do not use built-in directive ids as custom directive id: " + e);
}
function Cr(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (N(), En(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), Qe());
	}
}
function wr(e, t) {
	if (process.env.NODE_ENV !== "production" && (!$ || $.isMounted) && B("provide() can only be used inside setup()."), $) {
		let n = $.provides, r = $.parent && $.parent.provides;
		r === n && (n = $.provides = Object.create(r)), n[e] = t;
	}
}
function Tr(e, t, n = !1) {
	let r = wo();
	if (r || zi) {
		let i = zi ? zi._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
		process.env.NODE_ENV !== "production" && B(`injection "${String(e)}" not found.`);
	} else process.env.NODE_ENV !== "production" && B("inject() can only be used inside setup() or functional components.");
}
var Er = /* @__PURE__ */ Symbol.for("v-scx"), Dr = () => {
	{
		let e = Tr(Er);
		return e || process.env.NODE_ENV !== "production" && B("Server rendering context not provided. Make sure to only call useSSRContext() conditionally in the server build."), e;
	}
};
function Or(e, t, n) {
	return process.env.NODE_ENV !== "production" && !h(t) && B("`watch(fn, options?)` signature has been moved to a separate API. Use `watchEffect(fn, options?)` instead. `watch` now only supports `watch(source, cb, options?) signature."), kr(e, t, n);
}
function kr(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i;
	process.env.NODE_ENV !== "production" && !n && (a !== void 0 && B("watch() \"immediate\" option is only respected when using the watch(source, callback, options?) signature."), o !== void 0 && B("watch() \"deep\" option is only respected when using the watch(source, callback, options?) signature."), l !== void 0 && B("watch() \"once\" option is only respected when using the watch(source, callback, options?) signature."));
	let u = s({}, i);
	process.env.NODE_ENV !== "production" && (u.onWarn = B);
	let d = n && a || !n && c !== "post", f;
	if (Mo) {
		if (c === "sync") {
			let e = Dr();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = $;
	u.call = (e, t, n) => En(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		G(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : Rn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = pn(e, n, u);
	return Mo && (f ? f.push(h) : d && h()), h;
}
function Ar(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? jr(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Do(this), s = kr(i, a.bind(r), n);
	return o(), s;
}
function jr(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var Mr = /* @__PURE__ */ Symbol("_vte"), Nr = (e) => e.__isTeleport, Pr = /* @__PURE__ */ Symbol("_leaveCb");
function Fr(e) {
	let t = e[0];
	if (e.length > 1) {
		let n = !1;
		for (let r of e) if (r.type !== q) {
			if (process.env.NODE_ENV !== "production" && n) {
				B("<transition> can only be used on a single element or component. Use <transition-group> for lists.");
				break;
			}
			if (t = r, n = !0, process.env.NODE_ENV === "production") break;
		}
	}
	return t;
}
function Ir(e) {
	if (!Gr(e)) return Nr(e.type) && e.children ? Fr(e.children) : e;
	if (e.component) return e.component.subTree;
	let { shapeFlag: t, children: n } = e;
	if (n) {
		if (t & 16) return n[0];
		if (t & 32 && h(n.default)) return n.default();
	}
}
function Lr(e, t) {
	if (e.shapeFlag & 6 && e.component) {
		e.transition = t;
		let n = e.component.subTree;
		Lr(Nr(n.type) && Ir(n) || n, t);
	} else e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
function Rr(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
var zr = /* @__PURE__ */ new WeakSet();
function Br(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var Vr = /* @__PURE__ */ new WeakMap();
function Hr(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => Hr(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Wr(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && Hr(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? Vo(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e;
	if (process.env.NODE_ENV !== "production" && !f) {
		B("Missing ref owner context. ref cannot be used on hoisted vnodes. A vnode with ref must be created inside the render function.");
		return;
	}
	let m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ L(v), b = v === t ? i : (e) => process.env.NODE_ENV !== "production" && (u(y, e) && !/* @__PURE__ */ z(y[e]) && B(`Template ref "${e}" used on a non-ref value. It will not work in the production build.`), zr.has(y[e])) || Br(_, e) ? !1 : u(y, e), x = (e, t) => !(process.env.NODE_ENV !== "production" && zr.has(e) || t && Br(_, t));
	if (m != null && m !== p) {
		if (Ur(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ z(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) Tn(p, f, 12, [l, _]);
	else {
		let t = g(p), n = /* @__PURE__ */ z(p);
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
				} else t ? (_[p] = l, b(p) && (v[p] = l)) : n ? (x(p, e.k) && (p.value = l), e.k && (_[e.k] = l)) : process.env.NODE_ENV !== "production" && B("Invalid template ref type:", p, `(${typeof p})`);
			};
			if (l) {
				let t = () => {
					i(), Vr.delete(e);
				};
				t.id = -1, Vr.set(e, t), G(t, r);
			} else Ur(e), i();
		} else process.env.NODE_ENV !== "production" && B("Invalid template ref type:", p, `(${typeof p})`);
	}
}
function Ur(e) {
	let t = Vr.get(e);
	t && (t.flags |= 8, Vr.delete(e));
}
ue().requestIdleCallback, ue().cancelIdleCallback;
var Wr = (e) => !!e.type.__asyncLoader, Gr = (e) => e.type.__isKeepAlive;
function Kr(e, t) {
	Jr(e, "a", t);
}
function qr(e, t) {
	Jr(e, "da", t);
}
function Jr(e, t, n = $) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (Xr(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) Gr(e.parent.vnode) && Yr(r, t, n, e), e = e.parent;
	}
}
function Yr(e, t, n, r) {
	let i = Xr(t, e, r, !0);
	ri(() => {
		c(r[t], i);
	}, n);
}
function Xr(e, t, n = $, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			N();
			let i = Do(n), a = En(t, n, e, r);
			return i(), Qe(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
	process.env.NODE_ENV !== "production" && B(`${oe(wn[e].replace(/ hook$/, ""))} is called when there is no active component instance to be associated with. Lifecycle injection APIs can only be used during execution of setup(). If you are using async setup(), make sure to register lifecycle hooks before the first await statement.`);
}
var Zr = (e) => (t, n = $) => {
	(!Mo || e === "sp") && Xr(e, (...e) => t(...e), n);
}, Qr = Zr("bm"), $r = Zr("m"), ei = Zr("bu"), ti = Zr("u"), ni = Zr("bum"), ri = Zr("um"), ii = Zr("sp"), ai = Zr("rtg"), oi = Zr("rtc");
function si(e, t = $) {
	Xr("ec", e, t);
}
var ci = /* @__PURE__ */ Symbol.for("v-ndc");
function li(e, t, n, r) {
	let i, a = n && n[r], o = d(e);
	if (o || g(e)) {
		let n = o && /* @__PURE__ */ Xt(e), r = !1, s = !1;
		n && (r = !/* @__PURE__ */ I(e), s = /* @__PURE__ */ F(e), e = ut(e)), i = Array(e.length);
		for (let n = 0, o = e.length; n < o; n++) i[n] = t(r ? s ? $t(R(e[n])) : R(e[n]) : e[n], n, void 0, a && a[n]);
	} else if (typeof e == "number") {
		if (process.env.NODE_ENV !== "production" && (!Number.isInteger(e) || e < 0)) B(`The v-for range expects a positive integer value but got ${e}.`), i = [];
		else {
			i = Array(e);
			for (let n = 0; n < e; n++) i[n] = t(n + 1, n, void 0, a && a[n]);
		}
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
var ui = (e) => e ? jo(e) ? Vo(e) : ui(e.parent) : null, di = (e) => {
	let t = !1;
	for (;;) {
		if (e.patchFlag > 0 && e.patchFlag & 2048) {
			let n = Yi(e.children);
			if (!n) return;
			e = n, t = !0;
			continue;
		}
		let n = e.component;
		if (n && n.subTree) {
			e = n.subTree;
			continue;
		}
		let r = e.suspense;
		if (r && r.activeBranch) {
			e = r.activeBranch;
			continue;
		}
		return t ? e.el : void 0;
	}
}, fi = (e) => {
	let t = e.subTree && di(e.subTree);
	return t === void 0 ? e.vnode.el : t;
}, pi = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => process.env.NODE_ENV === "production" ? e.vnode.el : fi(e),
	$data: (e) => e.data,
	$props: (e) => process.env.NODE_ENV === "production" ? e.props : /* @__PURE__ */ Jt(e.props),
	$attrs: (e) => process.env.NODE_ENV === "production" ? e.attrs : /* @__PURE__ */ Jt(e.attrs),
	$slots: (e) => process.env.NODE_ENV === "production" ? e.slots : /* @__PURE__ */ Jt(e.slots),
	$refs: (e) => process.env.NODE_ENV === "production" ? e.refs : /* @__PURE__ */ Jt(e.refs),
	$parent: (e) => ui(e.parent),
	$root: (e) => ui(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => Di(e),
	$forceUpdate: (e) => e.f ||= () => {
		Rn(e.update);
	},
	$nextTick: (e) => e.n ||= In.bind(e.proxy),
	$watch: (e) => Ar.bind(e)
}), mi = (e) => e === "_" || e === "$", hi = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), gi = {
	get({ _: e }, n) {
		if (n === "__v_skip") return !0;
		let { ctx: r, setupState: i, data: a, props: o, accessCache: s, type: c, appContext: l } = e;
		if (process.env.NODE_ENV !== "production" && n === "__isVue") return !0;
		if (n[0] !== "$") {
			let e = s[n];
			if (e !== void 0) switch (e) {
				case 1: return i[n];
				case 2: return a[n];
				case 4: return r[n];
				case 3: return o[n];
			}
			else if (hi(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else Si && (s[n] = 0);
		}
		let d = pi[n], f, p;
		if (d) return n === "$attrs" ? (P(e.attrs, "get", ""), process.env.NODE_ENV !== "production" && Ki()) : process.env.NODE_ENV !== "production" && n === "$slots" && P(e, "get", n), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
		process.env.NODE_ENV !== "production" && U && (!g(n) || n.indexOf("__v") !== 0) && (a !== t && mi(n[0]) && u(a, n) ? B(`Property ${JSON.stringify(n)} must be accessed via $data because it starts with a reserved character ("$" or "_") and is not proxied on the render context.`) : e === U && B(`Property ${JSON.stringify(n)} was accessed during render but is not defined on instance.`));
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return hi(a, n) ? (a[n] = r, !0) : process.env.NODE_ENV !== "production" && a.__isScriptSetup && u(a, n) ? (B(`Cannot mutate <script setup> binding "${n}" from Options API.`), !1) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) ? (process.env.NODE_ENV !== "production" && B(`Attempting to mutate prop "${n}". Props are readonly.`), !1) : n[0] === "$" && n.slice(1) in e ? (process.env.NODE_ENV !== "production" && B(`Attempting to mutate public property "${n}". Properties starting with $ are reserved and readonly.`), !1) : (process.env.NODE_ENV !== "production" && n in e.appContext.config.globalProperties ? Object.defineProperty(o, n, {
			enumerable: !0,
			configurable: !0,
			value: r
		}) : o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || hi(n, c) || u(o, c) || u(i, c) || u(pi, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
process.env.NODE_ENV !== "production" && (gi.ownKeys = (e) => (B("Avoid app logic that relies on enumerating keys on a component instance. The keys will be empty in production mode to avoid performance overhead."), Reflect.ownKeys(e)));
function _i(e) {
	let t = {};
	return Object.defineProperty(t, "_", {
		configurable: !0,
		enumerable: !1,
		get: () => e
	}), Object.keys(pi).forEach((n) => {
		Object.defineProperty(t, n, {
			configurable: !0,
			enumerable: !1,
			get: () => pi[n](e),
			set: r
		});
	}), t;
}
function vi(e) {
	let { ctx: t, propsOptions: [n] } = e;
	n && Object.keys(n).forEach((n) => {
		Object.defineProperty(t, n, {
			enumerable: !0,
			configurable: !0,
			get: () => e.props[n],
			set: r
		});
	});
}
function yi(e) {
	let { ctx: t, setupState: n } = e;
	Object.keys(/* @__PURE__ */ L(n)).forEach((e) => {
		if (!n.__isScriptSetup) {
			if (mi(e[0])) {
				B(`setup() return property ${JSON.stringify(e)} should not start with "$" or "_" which are reserved prefixes for Vue internals.`);
				return;
			}
			Object.defineProperty(t, e, {
				enumerable: !0,
				configurable: !0,
				get: () => n[e],
				set: r
			});
		}
	});
}
function bi(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
function xi() {
	let e = /* @__PURE__ */ Object.create(null);
	return (t, n) => {
		e[n] ? B(`${t} property "${n}" is already defined in ${e[n]}.`) : e[n] = t;
	};
}
var Si = !0;
function Ci(e) {
	let t = Di(e), n = e.proxy, i = e.ctx;
	Si = !1, t.beforeCreate && Ti(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: b, deactivated: x, beforeDestroy: S, beforeUnmount: C, destroyed: w, unmounted: ee, render: te, renderTracked: ne, renderTriggered: re, errorCaptured: T, serverPrefetch: ie, expose: E, inheritAttrs: ae, components: oe, directives: D, filters: se } = t, ce = process.env.NODE_ENV === "production" ? null : xi();
	if (process.env.NODE_ENV !== "production") {
		let [t] = e.propsOptions;
		if (t) for (let e in t) ce("Props", e);
	}
	if (u && wi(u, i, ce), s) for (let e in s) {
		let t = s[e];
		h(t) ? (process.env.NODE_ENV === "production" ? i[e] = t.bind(n) : Object.defineProperty(i, e, {
			value: t.bind(n),
			configurable: !0,
			enumerable: !0,
			writable: !0
		}), process.env.NODE_ENV !== "production" && ce("Methods", e)) : process.env.NODE_ENV !== "production" && B(`Method "${e}" has type "${typeof t}" in the component definition. Did you reference the function correctly?`);
	}
	if (a) {
		process.env.NODE_ENV !== "production" && !h(a) && B("The data option must be a function. Plain object usage is no longer supported.");
		let t = a.call(n, n);
		if (process.env.NODE_ENV !== "production" && y(t) && B("data() returned a Promise - note data() cannot be async; If you intend to perform data fetching before component renders, use async setup() + <Suspense>."), !v(t)) process.env.NODE_ENV !== "production" && B("data() should return an object.");
		else if (e.data = /* @__PURE__ */ Gt(t), process.env.NODE_ENV !== "production") for (let e in t) ce("Data", e), mi(e[0]) || Object.defineProperty(i, e, {
			configurable: !0,
			enumerable: !0,
			get: () => t[e],
			set: r
		});
	}
	if (Si = !0, o) for (let e in o) {
		let t = o[e], a = h(t) ? t.bind(n, n) : h(t.get) ? t.get.bind(n, n) : r;
		process.env.NODE_ENV !== "production" && a === r && B(`Computed property "${e}" has no getter.`);
		let s = qo({
			get: a,
			set: !h(t) && h(t.set) ? t.set.bind(n) : process.env.NODE_ENV === "production" ? r : () => {
				B(`Write operation failed: computed property "${e}" is readonly.`);
			}
		});
		Object.defineProperty(i, e, {
			enumerable: !0,
			configurable: !0,
			get: () => s.value,
			set: (e) => s.value = e
		}), process.env.NODE_ENV !== "production" && ce("Computed", e);
	}
	if (c) for (let e in c) Ei(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			wr(t, e[t]);
		});
	}
	f && Ti(f, e, "c");
	function O(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (O(Qr, p), O($r, m), O(ei, g), O(ti, _), O(Kr, b), O(qr, x), O(si, T), O(oi, ne), O(ai, re), O(ni, C), O(ri, ee), O(ii, ie), d(E)) {
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
	te && e.render === r && (e.render = te), ae != null && (e.inheritAttrs = ae), oe && (e.components = oe), D && (e.directives = D), ie && Rr(e);
}
function wi(e, t, n = r) {
	d(e) && (e = Mi(e));
	for (let r in e) {
		let i = e[r], a;
		a = v(i) ? "default" in i ? Tr(i.from || r, i.default, !0) : Tr(i.from || r) : Tr(i), /* @__PURE__ */ z(a) ? Object.defineProperty(t, r, {
			enumerable: !0,
			configurable: !0,
			get: () => a.value,
			set: (e) => a.value = e
		}) : t[r] = a, process.env.NODE_ENV !== "production" && n("Inject", r);
	}
}
function Ti(e, t, n) {
	En(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function Ei(e, t, n, r) {
	let i = r.includes(".") ? jr(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) ? Or(i, n) : process.env.NODE_ENV !== "production" && B(`Invalid watch handler specified by key "${e}"`, n);
	} else if (h(e)) Or(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => Ei(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) ? Or(i, r, e) : process.env.NODE_ENV !== "production" && B(`Invalid watch handler specified by key "${e.handler}"`, r);
		}
	} else process.env.NODE_ENV !== "production" && B(`Invalid watch option: "${r}"`, e);
}
function Di(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => Oi(c, e, o, !0)), Oi(c, t, o)), v(t) && a.set(t, c), c;
}
function Oi(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && Oi(e, a, n, !0), i && i.forEach((t) => Oi(e, t, n, !0));
	for (let i in t) if (r && i === "expose") process.env.NODE_ENV !== "production" && B("\"expose\" option is ignored when declared in mixins or extends. It should only be declared in the base component itself.");
	else {
		let r = ki[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var ki = {
	data: Ai,
	props: Pi,
	emits: Pi,
	methods: Ni,
	computed: Ni,
	beforeCreate: W,
	created: W,
	beforeMount: W,
	mounted: W,
	beforeUpdate: W,
	updated: W,
	beforeDestroy: W,
	beforeUnmount: W,
	destroyed: W,
	unmounted: W,
	activated: W,
	deactivated: W,
	errorCaptured: W,
	serverPrefetch: W,
	components: Ni,
	directives: Ni,
	watch: Fi,
	provide: Ai,
	inject: ji
};
function Ai(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function ji(e, t) {
	return Ni(Mi(e), Mi(t));
}
function Mi(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function W(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function Ni(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function Pi(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), bi(e), bi(t ?? {})) : t;
}
function Fi(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = W(e[r], t[r]);
	return n;
}
function Ii() {
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
var Li = 0;
function Ri(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (process.env.NODE_ENV !== "production" && B("root props passed to app.mount() must be an object."), r = null);
		let i = Ii(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: Li++,
			_component: n,
			_props: r,
			_container: null,
			_context: i,
			_instance: null,
			version: Yo,
			get config() {
				return i.config;
			},
			set config(e) {
				process.env.NODE_ENV !== "production" && B("app.config cannot be replaced. Modify individual options instead.");
			},
			use(e, ...t) {
				return a.has(e) ? process.env.NODE_ENV !== "production" && B("Plugin has already been applied to target app.") : e && h(e.install) ? (a.add(e), e.install(l, ...t)) : h(e) ? (a.add(e), e(l, ...t)) : process.env.NODE_ENV !== "production" && B("A plugin must either be a function or an object with an \"install\" function."), l;
			},
			mixin(e) {
				return i.mixins.includes(e) ? process.env.NODE_ENV !== "production" && B("Mixin has already been applied to target app" + (e.name ? `: ${e.name}` : "")) : i.mixins.push(e), l;
			},
			component(e, t) {
				return process.env.NODE_ENV !== "production" && Ao(e, i.config), t ? (process.env.NODE_ENV !== "production" && i.components[e] && B(`Component "${e}" has already been registered in target app.`), i.components[e] = t, l) : i.components[e];
			},
			directive(e, t) {
				return process.env.NODE_ENV !== "production" && Sr(e), t ? (process.env.NODE_ENV !== "production" && i.directives[e] && B(`Directive "${e}" has already been registered in target app.`), i.directives[e] = t, l) : i.directives[e];
			},
			mount(a, o, s) {
				if (c) process.env.NODE_ENV !== "production" && B("App has already been mounted.\nIf you want to remount the same app, move your app creation logic into a factory function and create fresh app instances for each mount - e.g. `const createMyApp = () => createApp(App)`");
				else {
					process.env.NODE_ENV !== "production" && a.__vue_app__ && B("There is already an app instance mounted on the host container.\n If you want to mount another app on the same host container, you need to unmount the previous app by calling `app.unmount()` first.");
					let u = l._ceVNode || Q(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), process.env.NODE_ENV !== "production" && (i.reload = () => {
						let t = fo(u);
						t.el = null, e(t, a, s);
					}), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, process.env.NODE_ENV !== "production" && (l._instance = u.component, cr(l, Yo)), Vo(u.component);
				}
			},
			onUnmount(e) {
				process.env.NODE_ENV !== "production" && typeof e != "function" && B(`Expected function as first argument to app.onUnmount(), but got ${typeof e}`), o.push(e);
			},
			unmount() {
				c ? (En(o, l._instance, 16), e(null, l._container), process.env.NODE_ENV !== "production" && (l._instance = null, lr(l)), delete l._container.__vue_app__) : process.env.NODE_ENV !== "production" && B("Cannot unmount an app that is not mounted.");
			},
			provide(e, t) {
				return process.env.NODE_ENV !== "production" && e in i.provides && (u(i.provides, e) ? B(`App already provides property with key "${String(e)}". It will be overwritten with the new value.`) : B(`App already provides property with key "${String(e)}" inherited from its parent element. It will be overwritten with the new value.`)), i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = zi;
				zi = l;
				try {
					return e();
				} finally {
					zi = t;
				}
			}
		};
		return l;
	};
}
var zi = null, Bi = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${T(t)}Modifiers`] || e[`${E(t)}Modifiers`];
function Vi(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t;
	if (process.env.NODE_ENV !== "production") {
		let { emitsOptions: t, propsOptions: [i] } = e;
		if (t) {
			if (!(n in t)) (!i || !(oe(T(n)) in i)) && B(`Component emitted event "${n}" but it is neither declared in the emits option nor as an "${oe(T(n))}" prop.`);
			else {
				let e = t[n];
				h(e) && (e(...r) || B(`Invalid event arguments: event validation failed for event "${n}".`));
			}
		}
	}
	let a = r, o = n.startsWith("update:"), s = o && Bi(i, n.slice(7));
	if (s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = a.map(O))), process.env.NODE_ENV !== "production" && vr(e, n, a), process.env.NODE_ENV !== "production") {
		let t = n.toLowerCase();
		t !== n && i[oe(t)] && B(`Event "${t}" is emitted in component ${Go(e, e.type)} but the handler is registered for "${n}". Note that HTML attributes are case-insensitive and you cannot use v-on to listen to camelCase events when using in-DOM templates. You should probably use "${E(n)}" instead of "${n}".`);
	}
	let c, l = i[c = oe(n)] || i[c = oe(T(n))];
	!l && o && (l = i[c = oe(E(n))]), l && En(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, En(u, e, 6, a);
	}
}
var Hi = /* @__PURE__ */ new WeakMap();
function Ui(e, t, n = !1) {
	let r = n ? Hi : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Ui(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function Wi(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, E(t)) || u(e, t));
}
var Gi = !1;
function Ki() {
	Gi = !0;
}
function qi(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [s], slots: c, attrs: l, emit: u, render: d, renderCache: f, props: p, data: m, setupState: h, ctx: g, inheritAttrs: _ } = e, v = br(e), y, b;
	process.env.NODE_ENV !== "production" && (Gi = !1);
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = process.env.NODE_ENV !== "production" && h.__isScriptSetup ? new Proxy(e, { get(e, t, n) {
				return B(`Property '${String(t)}' was accessed via 'this'. Avoid using 'this' in templates.`), Reflect.get(e, t, n);
			} }) : e;
			y = go(d.call(t, e, f, process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Jt(p), h, m, g)), b = l;
		} else {
			let e = t;
			process.env.NODE_ENV !== "production" && l === p && Ki(), y = go(e.length > 1 ? e(process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Jt(p), process.env.NODE_ENV === "production" ? {
				attrs: l,
				slots: c,
				emit: u
			} : {
				get attrs() {
					return Ki(), /* @__PURE__ */ Jt(l);
				},
				slots: c,
				emit: u
			}) : e(process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Jt(p), null)), b = t.props ? l : Xi(l);
		}
	} catch (t) {
		Za.length = 0, Dn(t, e, 1), y = Q(q);
	}
	let x = y, S;
	if (process.env.NODE_ENV !== "production" && y.patchFlag > 0 && y.patchFlag & 2048 && ([x, S] = Ji(y)), b && _ !== !1) {
		let e = Object.keys(b), { shapeFlag: t } = x;
		if (e.length) {
			if (t & 7) s && e.some(o) && (b = Zi(b, s)), x = fo(x, b, !1, !0);
			else if (process.env.NODE_ENV !== "production" && !Gi && x.type !== q) {
				let e = Object.keys(l), t = [], n = [];
				for (let r = 0, i = e.length; r < i; r++) {
					let i = e[r];
					a(i) ? o(i) || t.push(i[2].toLowerCase() + i.slice(3)) : n.push(i);
				}
				n.length && B(`Extraneous non-props attributes (${n.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.`), t.length && B(`Extraneous non-emits event listeners (${t.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text root nodes. If the listener is intended to be a component custom event listener only, declare it using the "emits" option.`);
			}
		}
	}
	if (n.dirs && (process.env.NODE_ENV !== "production" && !Qi(x) && B("Runtime directive used on component with non-element root node. The directives will not function as intended."), x = fo(x, null, !1, !0), x.dirs = x.dirs ? x.dirs.concat(n.dirs) : n.dirs), n.transition) {
		let e = Nr(x.type) && Ir(x) || x;
		process.env.NODE_ENV !== "production" && !Qi(e) && B("Component inside <Transition> renders non-element root node that cannot be animated."), Lr(e, n.transition);
	}
	return process.env.NODE_ENV !== "production" && S ? S(x) : y = x, br(v), y;
}
var Ji = (e) => {
	let t = e.children, n = e.dynamicChildren, r = Yi(t, !1);
	if (!r) return [e, void 0];
	if (process.env.NODE_ENV !== "production" && r.patchFlag > 0 && r.patchFlag & 2048) return Ji(r);
	let i = t.indexOf(r), a = n ? n.indexOf(r) : -1;
	return [go(r), (r) => {
		t[i] = r, n && (a > -1 ? n[a] = r : r.patchFlag > 0 && (e.dynamicChildren = [...n, r]));
	}];
};
function Yi(e, t = !0) {
	let n;
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		if (ro(i)) {
			if (i.type !== q || i.children === "v-if") {
				if (n) return;
				if (n = i, process.env.NODE_ENV !== "production" && t && n.patchFlag > 0 && n.patchFlag & 2048) return Yi(n.children);
			}
		} else return;
	}
	return n;
}
var Xi = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, Zi = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
}, Qi = (e) => e.shapeFlag & 7 || e.type === q;
function $i(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (process.env.NODE_ENV !== "production" && (i || s) && H || t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? ea(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (ta(o, r, n) && !Wi(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || ea(r, o, l) : !!o;
	return !1;
}
function ea(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (ta(t, e, a) && !Wi(n, a)) return !0;
	}
	return !1;
}
function ta(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !Ae(r, i) : r !== i;
}
function na({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var ra = {}, ia = () => Object.create(ra), aa = (e) => Object.getPrototypeOf(e) === ra;
function oa(e, t, n, r = !1) {
	let i = {}, a = ia();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), la(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	process.env.NODE_ENV !== "production" && ha(t || {}, i, e), e.props = n ? r ? i : /* @__PURE__ */ Kt(i) : e.type.props ? i : a, e.attrs = a;
}
function sa(e) {
	for (; e;) {
		if (e.type.__hmrId) return !0;
		e = e.parent;
	}
}
function ca(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ L(i), [c] = e.propsOptions, l = !1;
	if (!(process.env.NODE_ENV !== "production" && sa(e)) && (r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (Wi(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = T(o);
						i[t] = ua(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		la(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = E(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = ua(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && ct(e.attrs, "set", ""), process.env.NODE_ENV !== "production" && ha(t || {}, i, e);
}
function la(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (ee(t)) continue;
		let l = n[t], d;
		a && u(a, d = T(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : Wi(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ L(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = ua(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function ua(e, t, n, r, i, a) {
	let o = e[n];
	if (o != null) {
		let e = u(o, "default");
		if (e && r === void 0) {
			let e = o.default;
			if (o.type !== Function && !o.skipFactory && h(e)) {
				let { propsDefaults: a } = i;
				if (n in a) r = a[n];
				else {
					let o = Do(i);
					r = a[n] = e.call(null, t), o();
				}
			} else r = e;
			i.ce && i.ce._setProp(n, r);
		}
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === E(n)) && (r = !0));
	}
	return r;
}
var da = /* @__PURE__ */ new WeakMap();
function fa(e, r, i = !1) {
	let a = i ? da : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = fa(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		process.env.NODE_ENV !== "production" && !g(c[e]) && B("props must be strings when using array syntax.", c[e]);
		let n = T(c[e]);
		pa(n) && (l[n] = t);
	}
	else if (c) {
		process.env.NODE_ENV !== "production" && !v(c) && B("invalid props options", c);
		for (let e in c) {
			let t = T(e);
			if (pa(t)) {
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
	}
	let m = [l, f];
	return v(e) && a.set(e, m), m;
}
function pa(e) {
	return e[0] !== "$" && !ee(e) || (process.env.NODE_ENV !== "production" && B(`Invalid prop name: "${e}" is a reserved property.`), !1);
}
function ma(e) {
	return e === null ? "null" : typeof e == "function" ? e.name || "" : typeof e == "object" && e.constructor && e.constructor.name || "";
}
function ha(e, t, n) {
	let r = /* @__PURE__ */ L(t), i = n.propsOptions[0], a = Object.keys(e).map((e) => T(e));
	for (let e in i) {
		let t = i[e];
		t != null && ga(e, r[e], t, process.env.NODE_ENV === "production" ? r : /* @__PURE__ */ Jt(r), !a.includes(e));
	}
}
function ga(e, t, n, r, i) {
	let { type: a, required: o, validator: s, skipCheck: c } = n;
	if (o && i) {
		B("Missing required prop: \"" + e + "\"");
		return;
	}
	if (t != null || o) {
		if (a != null && a !== !0 && !c) {
			let n = !1, r = d(a) ? a : [a], i = [];
			for (let e = 0; e < r.length && !n; e++) {
				let { valid: a, expectedType: o } = va(t, r[e]);
				i.push(o || ""), n = a;
			}
			if (!n) {
				B(ya(e, t, i));
				return;
			}
		}
		s && !s(t, r) && B("Invalid prop: custom validator check failed for prop \"" + e + "\".");
	}
}
var _a = /* @__PURE__ */ e("String,Number,Boolean,Function,Symbol,BigInt");
function va(e, t) {
	let n, r = ma(t);
	if (r === "null") n = e === null;
	else if (_a(r)) {
		let i = typeof e;
		n = i === r.toLowerCase(), !n && i === "object" && (n = e instanceof t);
	} else n = r === "Object" ? v(e) : r === "Array" ? d(e) : e instanceof t;
	return {
		valid: n,
		expectedType: r
	};
}
function ya(e, t, n) {
	if (n.length === 0) return `Prop type [] for prop "${e}" won't match anything. Did you mean to use type Array instead?`;
	let r = `Invalid prop: type check failed for prop "${e}". Expected ${n.map(ae).join(" | ")}`, i = n[0], a = S(t), o = ba(t, i), s = ba(t, a);
	return n.length === 1 && xa(i) && Sa(i, a) && (r += ` with value ${o}`), r += `, got ${a} `, xa(a) && (r += `with value ${s}.`), r;
}
function ba(e, t) {
	return _(e) ? e.toString() : t === "String" ? `"${e}"` : t === "Number" ? `${Number(e)}` : `${e}`;
}
function xa(e) {
	return [
		"string",
		"number",
		"boolean"
	].some((t) => e.toLowerCase() === t);
}
function Sa(...e) {
	return e.every((e) => {
		let t = e.toLowerCase();
		return t !== "boolean" && t !== "symbol";
	});
}
var Ca = (e) => e === "_" || e === "_ctx" || e === "$stable", wa = (e) => d(e) ? e.map(go) : [go(e)], Ta = (e, t, n) => {
	if (t._n) return t;
	let r = xr((...r) => (process.env.NODE_ENV !== "production" && $ && !(n === null && U) && !(n && n.root !== $.root) && B(`Slot "${e}" invoked outside of the render function: this will not track dependencies used in the slot. Invoke the slot function inside the render function instead.`), wa(t(...r))), n);
	return r._c = !1, r;
}, Ea = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (Ca(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = Ta(n, i, r);
		else if (i != null) {
			process.env.NODE_ENV !== "production" && B(`Non-function value encountered for slot "${n}". Prefer function slots for better performance.`);
			let e = wa(i);
			t[n] = () => e;
		}
	}
}, Da = (e, t) => {
	process.env.NODE_ENV !== "production" && !Gr(e.vnode) && B("Non-function value encountered for default slot. Prefer function slots for better performance.");
	let n = wa(t);
	e.slots.default = () => n;
}, Oa = (e, t, n) => {
	for (let r in t) (n || !Ca(r)) && (e[r] = t[r]);
}, ka = (e, t, n) => {
	let r = e.slots = ia();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (Oa(r, t, n), n && ce(r, "_", e, !0)) : Ea(t, r);
	} else t && Da(e, t);
}, Aa = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let t = n._;
		t ? process.env.NODE_ENV !== "production" && H ? (Oa(a, n, r), ct(e, "set", "$slots")) : r && t === 1 ? o = !1 : Oa(a, n, r) : (o = !n.$stable, Ea(n, a)), s = n;
	} else n && (Da(e, n), s = { default: 1 });
	if (o) for (let e in a) !Ca(e) && s[e] == null && delete a[e];
}, ja, Ma;
function Na(e, t) {
	e.appContext.config.performance && Fa() && Ma.mark(`vue-${t}-${e.uid}`), process.env.NODE_ENV !== "production" && hr(e, t, Fa() ? Ma.now() : Date.now());
}
function Pa(e, t) {
	if (e.appContext.config.performance && Fa()) {
		let n = `vue-${t}-${e.uid}`, r = n + ":end", i = `<${Go(e, e.type)}> ${t}`;
		Ma.mark(r), Ma.measure(i, n, r), Ma.clearMeasures(i), Ma.clearMarks(n), Ma.clearMarks(r);
	}
	process.env.NODE_ENV !== "production" && gr(e, t, Fa() ? Ma.now() : Date.now());
}
function Fa() {
	return ja === void 0 && (typeof window < "u" && window.performance ? (ja = !0, Ma = window.performance) : ja = !1), ja;
}
function Ia() {
	let e = [];
	if (process.env.NODE_ENV !== "production" && e.length) {
		let t = e.length > 1;
		console.warn(`Feature flag${t ? "s" : ""} ${e.join(", ")} ${t ? "are" : "is"} not explicitly defined. You are running the esm-bundler build of Vue, which expects these compile-time feature flags to be globally injected via the bundler config in order to get better tree-shaking in the production bundle.

For more details, see https://link.vuejs.org/feature-flags.`);
	}
}
var G = Ja;
function La(e) {
	return Ra(e);
}
function Ra(e, i) {
	Ia();
	let a = ue();
	a.__VUE__ = !0, process.env.NODE_ENV !== "production" && sr(a.__VUE_DEVTOOLS_GLOBAL_HOOK__, a);
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, r, i = null, a = null, o = null, s = void 0, c = null, l = process.env.NODE_ENV !== "production" && H ? !1 : !!t.dynamicChildren) => {
		if (e === t) return;
		e && !io(e, t) && (i = Se(e), _e(e, a, o, !0), e = null), t.patchFlag === -2 && (l = !1, t.dynamicChildren = null), t.dynamicChildren && e && e.dynamicChildren && e.dynamicChildren.hasOnce && (t.dynamicChildren === n && (t.dynamicChildren = []), t.dynamicChildren.hasOnce = !0);
		let { type: u, ref: d, shapeFlag: f } = t;
		switch (u) {
			case Ya:
				y(e, t, r, i);
				break;
			case q:
				b(e, t, r, i);
				break;
			case Xa:
				e == null ? x(t, r, i, s) : process.env.NODE_ENV !== "production" && S(e, t, r, s);
				break;
			case K:
				oe(e, t, r, i, a, o, s, c, l);
				break;
			default: f & 1 ? te(e, t, r, i, a, o, s, c, l) : f & 6 ? D(e, t, r, i, a, o, s, c, l) : f & 64 || f & 128 ? u.process(e, t, r, i, a, o, s, c, l, Te) : process.env.NODE_ENV !== "production" && B("Invalid VNode type:", u, `(${typeof u})`);
		}
		d != null && a ? Hr(d, e && e.ref, o, t || e, !t) : d == null && e && e.ref != null && Hr(e.ref, null, o, e, !0);
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
	}, S = (e, t, n, r) => {
		if (t.children !== e.children) {
			let i = h(e.anchor);
			w(e), [t.el, t.anchor] = _(t.children, n, i, r);
		} else t.el = e.el, t.anchor = e.anchor;
	}, C = ({ el: e, anchor: t }, n, r) => {
		let i;
		for (; e && e !== t;) i = h(e), o(e, n, r), e = i;
		o(t, n, r);
	}, w = ({ el: e, anchor: t }) => {
		let n;
		for (; e && e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, te = (e, t, n, r, i, a, o, s, c) => {
		if (t.type === "svg" ? o = "svg" : t.type === "math" && (o = "mathml"), e == null) ne(t, n, r, i, a, o, s, c);
		else {
			let n = e.el && e.el._isVueCE ? e.el : null;
			try {
				n && n._beginPatch(), ie(e, t, i, a, o, s, c);
			} finally {
				n && n._endPatch();
			}
		}
	}, ne = (e, t, n, r, i, a, s, u) => {
		let d, f, { props: m, shapeFlag: h, transition: g, dirs: _ } = e;
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && T(e.children, d, null, r, i, za(e, a), s, u), _ && Cr(e, null, r, "created"), re(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !ee(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && bo(f, r, e);
		}
		process.env.NODE_ENV !== "production" && (ce(d, "__vnode", e, !0), ce(d, "__vueParentComponent", r, !0)), _ && Cr(e, null, r, "beforeMount");
		let v = Va(i, g);
		if (v && g.beforeEnter(d), o(d, t, n), (f = m && m.onVnodeMounted) || v || _) {
			let t = process.env.NODE_ENV !== "production" && H;
			G(() => {
				let n;
				process.env.NODE_ENV !== "production" && (n = Kn(t));
				try {
					f && bo(f, r, e), v && g.enter(d), _ && Cr(e, null, r, "mounted");
				} finally {
					process.env.NODE_ENV !== "production" && Kn(n);
				}
			}, i);
		}
	}, re = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (process.env.NODE_ENV !== "production" && n.patchFlag > 0 && n.patchFlag & 2048 && (n = Yi(n.children) || n), t === n || qa(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				re(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, T = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? _o(e[l]) : go(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, ie = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el;
		process.env.NODE_ENV !== "production" && (l.__vnode = n);
		let { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && Ba(r, !1), (g = h.onVnodeBeforeUpdate) && bo(g, r, n, e), f && Cr(n, e, r, "beforeUpdate"), r && Ba(r, !0), (process.env.NODE_ENV !== "production" && H || d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length)) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? (E(e.dynamicChildren, d, l, r, i, za(n, a), o), process.env.NODE_ENV !== "production" && Ha(e, n)) : s || pe(e, n, l, null, r, i, za(n, a), o, !1), u > 0) {
			if (u & 16) ae(l, m, h, r, a);
			else if (u & 2 && m.class !== h.class && c(l, "class", null, h.class, a), u & 4 && c(l, "style", m.style, h.style, a), u & 8) {
				let e = n.dynamicProps;
				for (let t = 0; t < e.length; t++) {
					let n = e[t], i = m[n], o = h[n];
					(o !== i || n === "value") && c(l, n, i, o, a, r);
				}
			}
			u & 1 && e.children !== n.children && p(l, n.children);
		} else !s && d == null && ae(l, m, h, r, a);
		((g = h.onVnodeUpdated) || f) && G(() => {
			g && bo(g, r, n, e), f && Cr(n, e, r, "updated");
		}, i);
	}, E = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === K || !io(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
			v(c, l, u, null, r, i, a, o, !0);
		}
	}, ae = (e, n, r, i, a) => {
		if (n !== r) {
			if (n !== t) for (let t in n) !ee(t) && !(t in r) && c(e, t, n[t], null, a, i);
			for (let t in r) {
				if (ee(t)) continue;
				let o = r[t], s = n[t];
				o !== s && t !== "value" && c(e, t, s, o, a, i);
			}
			"value" in r && c(e, "value", n.value, r.value, a);
		}
	}, oe = (e, t, n, r, i, a, s, c, l) => {
		let d = t.el = e ? e.el : u(""), f = t.anchor = e ? e.anchor : u(""), { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t;
		process.env.NODE_ENV !== "production" && (H || p & 2048) && (p = 0, l = !1, m = null), h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), T(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (E(e.dynamicChildren, m, n, i, a, s, c), process.env.NODE_ENV === "production" ? (t.key != null || i && t === i.subTree) && Ha(e, t, !0) : Ha(e, t)) : pe(e, t, n, f, i, a, s, c, l);
	}, D = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : O(t, n, r, i, a, o, c) : le(e, t, c);
	}, O = (e, t, n, r, i, a, o) => {
		let s = e.component = Co(e, r, i);
		if (process.env.NODE_ENV !== "production" && s.type.__hmrId && Yn(s), process.env.NODE_ENV !== "production" && (gn(e), Na(s, "mount")), Gr(e) && (s.ctx.renderer = Te), process.env.NODE_ENV !== "production" && Na(s, "init"), No(s, !1, o), process.env.NODE_ENV !== "production" && Pa(s, "init"), process.env.NODE_ENV !== "production" && H && (e.el = null), s.asyncDep) {
			if (i && i.registerDep(s, de, o), !e.el) {
				let r = s.subTree = Q(q);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else de(s, e, t, n, i, a, o);
		process.env.NODE_ENV !== "production" && (_n(), Pa(s, "mount"));
	}, le = (e, t, n) => {
		let r = t.component = e.component;
		if ($i(e, t, n)) {
			if (r.asyncDep && !r.asyncResolved) {
				process.env.NODE_ENV !== "production" && gn(t), t.el = e.el, fe(r, t, n), process.env.NODE_ENV !== "production" && _n();
				return;
			}
			r.next = t, r.update();
		} else t.el = e.el, r.vnode = t;
	}, de = (e, t, n, r, i, a, o) => {
		let s = () => {
			if (e.isMounted) {
				let { next: t, bu: n, u: r, parent: s, vnode: c } = e;
				{
					let n = Wa(e);
					if (n) {
						t && (t.el = c.el, fe(e, t, o)), n.asyncDep.then(() => {
							G(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				process.env.NODE_ENV !== "production" && gn(t || e.vnode), Ba(e, !1), t ? (t.el = c.el, fe(e, t, o)) : t = c, n && se(n), (d = t.props && t.props.onVnodeBeforeUpdate) && bo(d, s, t, c), Ba(e, !0), process.env.NODE_ENV !== "production" && Na(e, "render");
				let f = qi(e);
				process.env.NODE_ENV !== "production" && Pa(e, "render");
				let p = e.subTree;
				e.subTree = f, process.env.NODE_ENV !== "production" && Na(e, "patch"), v(p, f, m(p.el), Se(p), e, i, a), process.env.NODE_ENV !== "production" && Pa(e, "patch"), t.el = f.el, u === null && na(e, f.el), r && G(r, i), (d = t.props && t.props.onVnodeUpdated) && G(() => bo(d, s, t, c), i), process.env.NODE_ENV !== "production" && dr(e), process.env.NODE_ENV !== "production" && _n();
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Wr(t);
				if (Ba(e, !1), l && se(l), !m && (o = c && c.onVnodeBeforeMount) && bo(o, d, t), Ba(e, !0), s && De) {
					let t = () => {
						process.env.NODE_ENV !== "production" && Na(e, "render"), e.subTree = qi(e), process.env.NODE_ENV !== "production" && Pa(e, "render"), process.env.NODE_ENV !== "production" && Na(e, "hydrate"), De(s, e.subTree, e, i, null), process.env.NODE_ENV !== "production" && Pa(e, "hydrate");
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0), process.env.NODE_ENV !== "production" && Na(e, "render");
					let o = e.subTree = qi(e);
					process.env.NODE_ENV !== "production" && Pa(e, "render"), process.env.NODE_ENV !== "production" && Na(e, "patch"), v(null, o, n, r, e, i, a), process.env.NODE_ENV !== "production" && Pa(e, "patch"), t.el = o.el;
				}
				if (u && G(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					G(() => bo(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Wr(d.vnode) && d.vnode.shapeFlag & 256) && e.a && G(e.a, i), e.isMounted = !0, process.env.NODE_ENV !== "production" && ur(e), t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new Re(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => Rn(u), Ba(e, !0), process.env.NODE_ENV !== "production" && (c.onTrack = e.rtc ? (t) => se(e.rtc, t) : void 0, c.onTrigger = e.rtg ? (t) => se(e.rtg, t) : void 0), l();
	}, fe = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, ca(e, t.props, r, n), Aa(e, t.children, n), N(), Vn(e), Qe();
	}, pe = (e, t, n, r, i, a, o, s, c = !1) => {
		let l = e && e.children, u = e ? e.shapeFlag : 0, d = t.children, { patchFlag: f, shapeFlag: m } = t;
		if (f > 0) {
			if (f & 128) {
				he(l, d, n, r, i, a, o, s, c);
				return;
			}
			if (f & 256) {
				me(l, d, n, r, i, a, o, s, c);
				return;
			}
		}
		m & 8 ? (u & 16 && xe(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? he(l, d, n, r, i, a, o, s, c) : xe(l, i, a, !0) : (u & 8 && p(n, ""), m & 16 && T(d, n, r, i, a, o, s, c));
	}, me = (e, t, r, i, a, o, s, c, l) => {
		e ||= n, t ||= n;
		let u = e.length, d = t.length, f = Math.min(u, d), p = 0;
		for (; p < f; p++) {
			let n = t[p] = l ? _o(t[p]) : go(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? xe(e, a, o, !0, !1, f) : T(t, r, i, a, o, s, c, l, f);
	}, he = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? _o(t[u]) : go(t[u]);
			if (io(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? _o(t[p]) : go(t[p]);
			if (io(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? _o(t[u]) : go(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) _e(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? _o(t[u]) : go(t[u]);
				e.key != null && (process.env.NODE_ENV !== "production" && g.has(e.key) && B("Duplicate keys found during update:", JSON.stringify(e.key), "Make sure keys are unique."), g.set(e.key, u));
			}
			let _, y = 0, b = p - h + 1, x = !1, S = 0, C = Array(b);
			for (u = 0; u < b; u++) C[u] = 0;
			for (u = m; u <= f; u++) {
				let n = e[u];
				if (y >= b) {
					_e(n, a, o, !0);
					continue;
				}
				let i;
				if (n.key != null) i = g.get(n.key);
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && io(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? _e(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? Ua(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || Ka(f) : i;
				C[u] === 0 ? v(null, n, r, p, a, o, s, c, l) : x && (_ < 0 || u !== w[_] ? ge(n, r, p, 2) : _--);
			}
		}
	}, ge = (e, t, n, r, i = null) => {
		let { el: a, type: c, transition: l, children: u, shapeFlag: d } = e;
		if (d & 6) {
			ge(e.component.subTree, t, n, r);
			return;
		}
		if (d & 128) {
			e.suspense.move(t, n, r);
			return;
		}
		if (d & 64) {
			c.move(e, t, n, Te);
			return;
		}
		if (c === K) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) ge(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === Xa) {
			C(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[Pr] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), G(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[Pr];
					a._isLeaving && a[Pr](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, _e = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if ((d === -2 || l && l.hasOnce) && (i = !1), s != null && (N(), Hr(s, null, n, e, !0), Qe()), p != null && (!e.ctx || e.ctx === t) && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Wr(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && bo(_, t, e), u & 6) be(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && Cr(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, Te, r) : l && !l.hasOnce && (a !== K || d > 0 && d & 64) ? xe(l, t, n, !1, !0) : (a === K && d & 384 || !i && u & 16) && xe(c, t, n), r && ve(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && G(() => {
			_ && bo(_, t, e), h && Cr(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, ve = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === K) {
			process.env.NODE_ENV !== "production" && e.patchFlag > 0 && e.patchFlag & 2048 && i && !i.persisted ? e.children.forEach((e) => {
				e.type === q ? s(e.el) : ve(e);
			}) : ye(n, r);
			return;
		}
		if (t === Xa) {
			w(e), i && !i.persisted && i.afterLeave && i.afterLeave();
			return;
		}
		let a = () => {
			s(n), i && !i.persisted && i.afterLeave && i.afterLeave();
		};
		if (e.shapeFlag & 1 && i && !i.persisted) {
			let { leave: t, delayLeave: r } = i, o = () => t(n, a);
			r ? r(e.el, a, o) : o();
		} else a();
	}, ye = (e, t) => {
		let n;
		for (; e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, be = (e, t, n) => {
		process.env.NODE_ENV !== "production" && e.type.__hmrId && Xn(e);
		let { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e;
		Ga(c), Ga(l), r && se(r), i.stop(), a ? (a.flags |= 8, _e(o, e, t, n)) : e.vnode.el && o && (o.transition = e.vnode.transition, _e(o, e, t, n)), s && G(s, t), G(() => {
			e.isUnmounted = !0;
		}, t), process.env.NODE_ENV !== "production" && pr(e);
	}, xe = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) _e(e[o], t, n, r, i);
	}, Se = (e) => {
		if (e.shapeFlag & 6) return Se(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[Mr];
		return n ? h(n) : t;
	}, Ce = !1, we = (e, t, n) => {
		let r;
		e == null ? t._vnode && (_e(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, Ce ||= (Ce = !0, Vn(r), Hn(), !1);
	}, Te = {
		p: v,
		um: _e,
		m: ge,
		r: ve,
		mt: O,
		mc: T,
		pc: pe,
		pbc: E,
		n: Se,
		o: e
	}, Ee, De;
	return i && ([Ee, De] = i(Te)), {
		render: we,
		hydrate: Ee,
		createApp: Ri(we, Ee)
	};
}
function za({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function Ba({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function Va(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function Ha(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = _o(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && Ha(t, a)), a.type === Ya && (a.patchFlag === -1 && (a = i[e] = _o(a)), a.el = t.el), a.type === q && !a.el && (a.el = t.el), process.env.NODE_ENV !== "production" && a.el && (a.el.__vnode = a);
	}
}
function Ua(e) {
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
function Wa(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : Wa(t);
}
function Ga(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function Ka(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? Ka(t.subTree) : null;
}
var qa = (e) => e.__isSuspense;
function Ja(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : Bn(e);
}
var K = /* @__PURE__ */ Symbol.for("v-fgt"), Ya = /* @__PURE__ */ Symbol.for("v-txt"), q = /* @__PURE__ */ Symbol.for("v-cmt"), Xa = /* @__PURE__ */ Symbol.for("v-stc"), Za = [], J = null;
function Y(e = !1) {
	Za.push(J = e ? null : []);
}
function Qa() {
	Za.pop(), J = Za[Za.length - 1] || null;
}
var $a = 1;
function eo(e, t = !1) {
	$a += e, e < 0 && J && t && (J.hasOnce = !0);
}
function to(e) {
	return e.dynamicChildren = $a > 0 ? J || n : null, Qa(), $a > 0 && J && J.push(e), e;
}
function X(e, t, n, r, i, a) {
	return to(Z(e, t, n, r, i, a, !0));
}
function no(e, t, n, r, i) {
	return to(Q(e, t, n, r, i, !0));
}
function ro(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function io(e, t) {
	if (process.env.NODE_ENV !== "production" && t.shapeFlag & 6 && e.component) {
		let n = qn.get(t.type);
		if (n && n.has(e.component)) return e.shapeFlag &= -257, t.shapeFlag &= -513, !1;
	}
	return e.type === t.type && e.key === t.key;
}
var ao = (...e) => lo(...e), oo = ({ key: e }) => e ?? null, so = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ z(e) || h(e) ? {
	i: U,
	r: e,
	k: t,
	f: !!n
} : e);
function Z(e, t = null, n = null, r = 0, i = null, a = e === K ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && oo(t),
		ref: t && so(t),
		scopeId: yr,
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
		ctx: U
	};
	if (s ? (vo(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), process.env.NODE_ENV !== "production" && c.key !== c.key && B("VNode created with invalid key (NaN). VNode type:", c.type), process.env.NODE_ENV !== "production" && t && c.shapeFlag & 1) {
		let e = t.innerHTML == null ? t.textContent == null ? null : "textContent" : "innerHTML";
		e && co(c.children) && B(`The \`${e}\` prop on <${c.type}> will override its children. Remove either the \`${e}\` prop or the children.`);
	}
	return $a > 0 && !o && J && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && J.push(c), c;
}
function co(e) {
	return g(e) ? e !== "" : d(e) ? e.length > 0 : !1;
}
var Q = process.env.NODE_ENV === "production" ? lo : ao;
function lo(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === ci) && (process.env.NODE_ENV !== "production" && !e && B(`Invalid vnode type when creating vnode: ${e}.`), e = q), ro(e)) {
		let r = fo(e, t, !0);
		return n && vo(r, n), $a > 0 && !a && J && (r.shapeFlag & 6 ? J[J.indexOf(e)] = r : J.push(r)), r.patchFlag = -2, r;
	}
	if (Ko(e) && (e = e.__vccOpts), t) {
		t = uo(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = ge(e)), v(n) && (/* @__PURE__ */ Zt(n) && !d(n) && (n = s({}, n)), t.style = de(n));
	}
	let o = g(e) ? 1 : qa(e) ? 128 : Nr(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return process.env.NODE_ENV !== "production" && o & 4 && /* @__PURE__ */ Zt(e) && (e = /* @__PURE__ */ L(e), B("Vue received a Component that was made a reactive object. This can lead to unnecessary performance overhead and should be avoided by marking the component with `markRaw` or using `shallowRef` instead of `ref`.", "\nComponent that was made reactive: ", e)), Z(e, t, n, r, i, o, a, !0);
}
function uo(e) {
	return e ? /* @__PURE__ */ Zt(e) || aa(e) ? s({}, e) : e : null;
}
function fo(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? yo(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && oo(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(so(t)) : [a, so(t)] : so(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: process.env.NODE_ENV !== "production" && o === -1 && d(s) ? s.map(po) : s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== K ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && fo(e.ssContent),
		ssFallback: e.ssFallback && fo(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce,
		cacheIndex: e.cacheIndex
	};
	return c && r && Lr(u, c.clone(u)), u;
}
function po(e) {
	let t = fo(e);
	return d(e.children) && (t.children = e.children.map(po)), t;
}
function mo(e = " ", t = 0) {
	return Q(Ya, null, e, t);
}
function ho(e = "", t = !1) {
	return t ? (Y(), no(q, null, e)) : Q(q, null, e);
}
function go(e) {
	return e == null || typeof e == "boolean" ? Q(q) : d(e) ? Q(K, null, e.slice()) : ro(e) ? _o(e) : Q(Ya, null, String(e));
}
function _o(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : fo(e);
}
function vo(e, t) {
	let n = 0, { shapeFlag: r } = e;
	if (t == null) t = null;
	else if (d(t)) n = 16;
	else if (typeof t == "object") {
		if (r & 65) {
			let n = t.default;
			n && (n._c && (n._d = !1), vo(e, n()), n._c && (n._d = !0));
			return;
		}
		{
			n = 32;
			let r = t._;
			!r && !aa(t) ? t._ctx = U : r === 3 && U && (U.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			vo(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: U
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [mo(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function yo(...e) {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		for (let e in r) if (e === "class") t.class !== r.class && (t.class = ge([t.class, r.class]));
		else if (e === "style") t.style = de([t.style, r.style]);
		else if (a(e)) {
			let n = t[e], i = r[e];
			i && n !== i && !(d(n) && n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !o(e) && (t[e] = i);
		} else e !== "" && (t[e] = r[e]);
	}
	return t;
}
function bo(e, t, n, r = null) {
	En(e, t, 7, [n, r]);
}
var xo = Ii(), So = 0;
function Co(e, n, r) {
	let i = e.type, a = (n ? n.appContext : e.appContext) || xo, o = {
		uid: So++,
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
		scope: new Fe(!0),
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
		propsOptions: fa(i, a),
		emitsOptions: Ui(i, a),
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
	return o.ctx = process.env.NODE_ENV === "production" ? { _: o } : _i(o), o.root = n ? n.root : o, o.emit = Vi.bind(null, o), e.ce && e.ce(o), o;
}
var $ = null, wo = () => $ || U, To, Eo;
{
	let e = ue(), t = (t, n) => {
		let r;
		return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => {
			r.length > 1 ? r.forEach((t) => t(e)) : r[0](e);
		};
	};
	To = t("__VUE_INSTANCE_SETTERS__", (e) => $ = e), Eo = t("__VUE_SSR_SETTERS__", (e) => Mo = e);
}
var Do = (e) => {
	let t = $;
	return To(e), e.scope.on(), () => {
		e.scope.off(), To(t);
	};
}, Oo = () => {
	$ && $.scope.off(), To(null);
}, ko = /* @__PURE__ */ e("slot,component");
function Ao(e, { isNativeTag: t }) {
	(ko(e) || t(e)) && B("Do not use built-in or reserved HTML elements as component id: " + e);
}
function jo(e) {
	return e.vnode.shapeFlag & 4;
}
var Mo = !1;
function No(e, t = !1, n = !1) {
	t && Eo(t);
	let { props: r, children: i } = e.vnode, a = jo(e);
	oa(e, r, a, t), ka(e, i, n || t);
	let o = a ? Po(e, t) : void 0;
	return t && Eo(!1), o;
}
function Po(e, t) {
	let n = e.type;
	if (process.env.NODE_ENV !== "production") {
		if (n.name && Ao(n.name, e.appContext.config), n.components) {
			let t = Object.keys(n.components);
			for (let n = 0; n < t.length; n++) Ao(t[n], e.appContext.config);
		}
		if (n.directives) {
			let e = Object.keys(n.directives);
			for (let t = 0; t < e.length; t++) Sr(e[t]);
		}
		n.compilerOptions && Io() && B("\"compilerOptions\" is only supported when using a build of Vue that includes the runtime compiler. Since you are using a runtime-only build, the options should be passed via your build tool config instead.");
	}
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, gi), process.env.NODE_ENV !== "production" && vi(e);
	let { setup: r } = n;
	if (r) {
		N();
		let i = e.setupContext = r.length > 1 ? Bo(e) : null, a = Do(e), o = Tn(r, e, 0, [process.env.NODE_ENV === "production" ? e.props : /* @__PURE__ */ Jt(e.props), i]), s = y(o);
		if (Qe(), a(), (s || e.sp) && !Wr(e) && Rr(e), s) {
			if (o.then(Oo, Oo), t) return o.then((n) => {
				Eo(!0);
				try {
					Fo(e, n, t);
				} finally {
					Eo(!1);
				}
			}).catch((t) => {
				Dn(t, e, 0);
			});
			e.asyncDep = o, process.env.NODE_ENV !== "production" && !e.suspense && B(`Component <${Go(e, n)}>: setup function returned a promise, but no <Suspense> boundary was found in the parent component tree. A component with async setup() must be nested in a <Suspense> in order to be rendered.`);
		} else Fo(e, o, t);
	} else Lo(e, t);
}
function Fo(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) ? (process.env.NODE_ENV !== "production" && ro(t) && B("setup() should not return VNodes directly - return a render function instead."), process.env.NODE_ENV !== "production" && (e.devtoolsRawSetupState = t), e.setupState = on(t), process.env.NODE_ENV !== "production" && yi(e)) : process.env.NODE_ENV !== "production" && t !== void 0 && B(`setup() should return an object. Received: ${t === null ? "null" : typeof t}`), Lo(e, n);
}
var Io = () => !0;
function Lo(e, t, n) {
	let i = e.type;
	e.render ||= i.render || r;
	{
		let t = Do(e);
		N();
		try {
			Ci(e);
		} finally {
			Qe(), t();
		}
	}
	process.env.NODE_ENV !== "production" && !i.render && e.render === r && !t && (i.template ? B("Component provided template option but runtime compilation is not supported in this build of Vue. Configure your bundler to alias \"vue\" to \"vue/dist/vue.esm-bundler.js\".") : B("Component is missing template or render function: ", i));
}
var Ro = process.env.NODE_ENV === "production" ? { get(e, t) {
	return P(e, "get", ""), e[t];
} } : {
	get(e, t) {
		return Ki(), P(e, "get", ""), e[t];
	},
	set() {
		return B("setupContext.attrs is readonly."), !1;
	},
	deleteProperty() {
		return B("setupContext.attrs is readonly."), !1;
	}
};
function zo(e) {
	return new Proxy(e.slots, { get(t, n) {
		return P(e, "get", "$slots"), t[n];
	} });
}
function Bo(e) {
	let t = (t) => {
		if (process.env.NODE_ENV !== "production" && (e.exposed && B("expose() should be called only once per setup()."), t != null)) {
			let e = typeof t;
			e === "object" && (d(t) ? e = "array" : /* @__PURE__ */ z(t) && (e = "ref")), e !== "object" && B(`expose() should be passed a plain object, received ${e}.`);
		}
		e.exposed = t || {};
	};
	if (process.env.NODE_ENV !== "production") {
		let n, r;
		return Object.freeze({
			get attrs() {
				return n ||= new Proxy(e.attrs, Ro);
			},
			get slots() {
				return r ||= zo(e);
			},
			get emit() {
				return (t, ...n) => e.emit(t, ...n);
			},
			expose: t
		});
	}
	return {
		attrs: new Proxy(e.attrs, Ro),
		slots: e.slots,
		emit: e.emit,
		expose: t
	};
}
function Vo(e) {
	return e.exposed ? e.exposeProxy ||= new Proxy(on(Qt(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in pi) return pi[n](e);
		},
		has(e, t) {
			return t in e || t in pi;
		}
	}) : e.proxy;
}
var Ho = /(?:^|[-_])\w/g, Uo = (e) => e.replace(Ho, (e) => e.toUpperCase()).replace(/[-_]/g, "");
function Wo(e, t = !0) {
	return h(e) ? e.displayName || e.name : e.name || t && e.__name;
}
function Go(e, t, n = !1) {
	let r = Wo(t);
	if (!r && t.__file) {
		let e = t.__file.match(/([^/\\]+)\.\w+$/);
		e && (r = e[1]);
	}
	if (!r && e) {
		let n = (e) => {
			for (let n in e) if (e[n] === t) return n;
		};
		r = n(e.components) || e.parent && n(e.parent.type.components) || n(e.appContext.components);
	}
	return r ? Uo(r) : n ? "App" : "Anonymous";
}
function Ko(e) {
	return h(e) && "__vccOpts" in e;
}
var qo = (e, t) => {
	let n = /* @__PURE__ */ cn(e, t, Mo);
	if (process.env.NODE_ENV !== "production") {
		let e = wo();
		e && e.appContext.config.warnRecursiveComputed && (n._warnRecursive = !0);
	}
	return n;
};
function Jo() {
	if (process.env.NODE_ENV === "production" || typeof window > "u") return;
	let e = { style: "color:#3ba776" }, n = { style: "color:#1677ff" }, r = { style: "color:#f5222d" }, i = { style: "color:#eb2f96" }, a = {
		__vue_custom_formatter: !0,
		header(t) {
			if (!v(t)) return null;
			if (t.__isVue) return [
				"div",
				e,
				"VueInstance"
			];
			if (/* @__PURE__ */ z(t)) {
				N();
				let n = t.value;
				return Qe(), [
					"div",
					{},
					[
						"span",
						e,
						p(t)
					],
					"<",
					l(n),
					">"
				];
			}
			return /* @__PURE__ */ Xt(t) ? [
				"div",
				{},
				[
					"span",
					e,
					/* @__PURE__ */ I(t) ? "ShallowReactive" : "Reactive"
				],
				"<",
				l(t),
				`>${/* @__PURE__ */ F(t) ? " (readonly)" : ""}`
			] : /* @__PURE__ */ F(t) ? [
				"div",
				{},
				[
					"span",
					e,
					/* @__PURE__ */ I(t) ? "ShallowReadonly" : "Readonly"
				],
				"<",
				l(t),
				">"
			] : null;
		},
		hasBody(e) {
			return e && e.__isVue;
		},
		body(e) {
			if (e && e.__isVue) return [
				"div",
				{},
				...o(e.$)
			];
		}
	};
	function o(e) {
		let n = [];
		e.type.props && e.props && n.push(c("props", /* @__PURE__ */ L(e.props))), e.setupState !== t && n.push(c("setup", e.setupState)), e.data !== t && n.push(c("data", /* @__PURE__ */ L(e.data)));
		let r = u(e, "computed");
		r && n.push(c("computed", r));
		let a = u(e, "inject");
		return a && n.push(c("injected", a)), n.push([
			"div",
			{},
			[
				"span",
				{ style: i.style + ";opacity:0.66" },
				"$ (internal): "
			],
			["object", { object: e }]
		]), n;
	}
	function c(e, t) {
		return t = s({}, t), Object.keys(t).length ? [
			"div",
			{ style: "line-height:1.25em;margin-bottom:0.6em" },
			[
				"div",
				{ style: "color:#476582" },
				e
			],
			[
				"div",
				{ style: "padding-left:1.25em" },
				...Object.keys(t).map((e) => [
					"div",
					{},
					[
						"span",
						i,
						e + ": "
					],
					l(t[e], !1)
				])
			]
		] : ["span", {}];
	}
	function l(e, t = !0) {
		return typeof e == "number" ? [
			"span",
			n,
			e
		] : typeof e == "string" ? [
			"span",
			r,
			JSON.stringify(e)
		] : typeof e == "boolean" ? [
			"span",
			i,
			e
		] : v(e) ? ["object", { object: t ? /* @__PURE__ */ L(e) : e }] : [
			"span",
			r,
			String(e)
		];
	}
	function u(e, t) {
		let n = e.type;
		if (h(n)) return;
		let r = {};
		for (let i in e.ctx) f(n, i, t) && (r[i] = e.ctx[i]);
		return r;
	}
	function f(e, t, n) {
		let r = e[n];
		if (d(r) && r.includes(t) || v(r) && t in r || e.extends && f(e.extends, t, n) || e.mixins && e.mixins.some((e) => f(e, t, n))) return !0;
	}
	function p(e) {
		return /* @__PURE__ */ I(e) ? "ShallowRef" : e.effect ? "ComputedRef" : "Ref";
	}
	window.devtoolsFormatters ? window.devtoolsFormatters.push(a) : window.devtoolsFormatters = [a];
}
var Yo = "3.5.43", Xo = process.env.NODE_ENV === "production" ? r : B;
process.env.NODE_ENV, process.env.NODE_ENV;
//#endregion
//#region node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js
var Zo = void 0, Qo = typeof window < "u" && window.trustedTypes;
if (Qo) try {
	Zo = /* @__PURE__ */ Qo.createPolicy("vue", { createHTML: (e) => e });
} catch (e) {
	process.env.NODE_ENV !== "production" && Xo(`Error creating trusted types policy: ${e}`);
}
var $o = Zo ? (e) => Zo.createHTML(e) : (e) => e, es = "http://www.w3.org/2000/svg", ts = "http://www.w3.org/1998/Math/MathML", ns = typeof document < "u" ? document : null, rs = ns && /* @__PURE__ */ ns.createElement("template"), is = {
	insert: (e, t, n) => {
		t.insertBefore(e, n || null);
	},
	remove: (e) => {
		let t = e.parentNode;
		t && t.removeChild(e);
	},
	createElement: (e, t, n, r) => {
		let i = t === "svg" ? ns.createElementNS(es, e) : t === "mathml" ? ns.createElementNS(ts, e) : n ? ns.createElement(e, { is: n }) : ns.createElement(e);
		return e === "select" && r && r.multiple != null && i.setAttribute("multiple", r.multiple), i;
	},
	createText: (e) => ns.createTextNode(e),
	createComment: (e) => ns.createComment(e),
	setText: (e, t) => {
		e.nodeValue = t;
	},
	setElementText: (e, t) => {
		e.textContent = t;
	},
	parentNode: (e) => e.parentNode,
	nextSibling: (e) => e.nextSibling,
	querySelector: (e) => ns.querySelector(e),
	setScopeId(e, t) {
		e.setAttribute(t, "");
	},
	insertStaticContent(e, t, n, r, i, a) {
		let o = n ? n.previousSibling : t.lastChild;
		if (i && (i === a || i.nextSibling)) for (; t.insertBefore(i.cloneNode(!0), n), i !== a && (i = i.nextSibling););
		else {
			rs.innerHTML = $o(r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e);
			let i = rs.content;
			if (r === "svg" || r === "mathml") {
				let e = i.firstChild;
				for (; e.firstChild;) i.appendChild(e.firstChild);
				i.removeChild(e);
			}
			t.insertBefore(i, n);
		}
		return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
	}
}, as = /* @__PURE__ */ Symbol("_vtc");
function os(e, t, n) {
	let r = e[as];
	r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
var ss = /* @__PURE__ */ Symbol("_vod"), cs = /* @__PURE__ */ Symbol("_vsh"), ls = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "CSS_VAR_TEXT"), us = /(?:^|;)\s*display\s*:/;
function ds(e, t, n) {
	let r = e.style, i = g(n), a = !1;
	if (n && !i) {
		if (t) {
			if (g(t)) for (let e of t.split(";")) {
				let t = e.slice(0, e.indexOf(":")).trim();
				n[t] ?? ms(r, t, "");
			}
			else for (let e in t) n[e] ?? ms(r, e, "");
		}
		for (let i in n) {
			i === "display" && (a = !0);
			let o = n[i];
			o == null ? ms(r, i, "") : vs(e, i, !g(t) && t ? t[i] : void 0, o) || ms(r, i, o);
		}
	} else if (i) {
		if (t !== n) {
			let e = r[ls];
			e && (n += ";" + e), r.cssText = n, a = us.test(n);
		}
	} else t && e.removeAttribute("style");
	ss in e && (e[ss] = a ? r.display : "", e[cs] && (r.display = "none"));
}
var fs = /[^\\];\s*$/, ps = /\s*!important$/;
function ms(e, t, n) {
	if (d(n)) n.forEach((n) => ms(e, t, n));
	else if (n ??= "", process.env.NODE_ENV !== "production" && fs.test(n) && Xo(`Unexpected semicolon at the end of '${t}' style value: '${n}'`), t.startsWith("--")) ps.test(n) ? e.setProperty(t, n.replace(ps, ""), "important") : e.setProperty(t, n);
	else {
		let r = _s(e, t);
		ps.test(n) ? e.setProperty(E(r), n.replace(ps, ""), "important") : e[r] = n;
	}
}
var hs = [
	"Webkit",
	"Moz",
	"ms"
], gs = {};
function _s(e, t) {
	let n = gs[t];
	if (n) return n;
	let r = T(t);
	if (r !== "filter" && r in e) return gs[t] = r;
	r = ae(r);
	for (let n = 0; n < hs.length; n++) {
		let i = hs[n] + r;
		if (i in e) return gs[t] = i;
	}
	return t;
}
function vs(e, t, n, r) {
	return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && g(r) && n === r;
}
var ys = "http://www.w3.org/1999/xlink";
function bs(e, t, n, r, i, a = we(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(ys, t.slice(6, t.length)) : e.setAttributeNS(ys, t, n) : n == null || a && !Te(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
}
function xs(e, t, n, r, i) {
	if (t === "innerHTML" || t === "textContent") {
		n != null && (e[t] = t === "innerHTML" ? $o(n) : n);
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
		r === "boolean" ? n = Te(n) : n == null && r === "string" ? (n = "", o = !0) : r === "number" && (n = 0, o = !0);
	}
	try {
		e[t] = n;
	} catch (e) {
		process.env.NODE_ENV !== "production" && !o && Xo(`Failed setting prop "${t}" on <${a.toLowerCase()}>: value ${n} is invalid.`, e);
	}
	o && e.removeAttribute(i || t);
}
function Ss(e, t, n, r) {
	e.addEventListener(t, n, r);
}
function Cs(e, t, n, r) {
	e.removeEventListener(t, n, r);
}
var ws = /* @__PURE__ */ Symbol("_vei");
function Ts(e, t, n, r, i = null) {
	let a = e[ws] || (e[ws] = {}), o = a[t];
	if (r && o) o.value = process.env.NODE_ENV === "production" ? r : Ns(r, t);
	else {
		let [n, s] = Os(t);
		r ? Ss(e, n, a[t] = Ms(process.env.NODE_ENV === "production" ? r : Ns(r, t), i), s) : o && (Cs(e, n, o, s), a[t] = void 0);
	}
}
var Es = /(Once|Passive|Capture)$/, Ds = /^on:?(?:Once|Passive|Capture)$/;
function Os(e) {
	let t, n;
	for (; (n = e.match(Es)) && !Ds.test(e);) t ||= {}, e = e.slice(0, e.length - n[1].length), t[n[1].toLowerCase()] = !0;
	return [e[2] === ":" ? e.slice(3) : E(e.slice(2)), t];
}
var ks = 0, As = /* @__PURE__ */ Promise.resolve(), js = () => ks ||= (As.then(() => ks = 0), Date.now());
function Ms(e, t) {
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
				e && En(e, t, 5, a);
			}
		} else En(r, t, 5, [e]);
	};
	return n.value = e, n.attached = js(), n;
}
function Ns(e, t) {
	return h(e) || d(e) ? e : (Xo(`Wrong type passed as event handler to ${t} - did you forget @ or : in front of your prop?
Expected function or array of functions, received type ${typeof e}.`), r);
}
var Ps = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Fs = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? os(e, r, c) : t === "style" ? ds(e, n, r) : a(t) ? o(t) || Ts(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), 1) : t[0] === "^" ? (t = t.slice(1), 0) : Is(e, t, r, c)) ? (xs(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && bs(e, t, r, c, s, t !== "value")) : e._isVueCE && (Ls(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? xs(e, T(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), bs(e, t, r, c));
};
function Is(e, t, n, r) {
	if (r) return !!(t === "innerHTML" || t === "textContent" || t in e && Ps(t) && h(n));
	if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA") return !1;
	if (t === "width" || t === "height") {
		let t = e.tagName;
		if (t === "IMG" || t === "VIDEO" || t === "CANVAS" || t === "SOURCE") return !1;
	}
	return Ps(t) && g(n) ? !1 : t in e;
}
function Ls(e, t) {
	let n = e._def.props;
	if (!n) return !1;
	let r = T(t);
	return Array.isArray(n) ? n.some((e) => T(e) === r) : Object.keys(n).some((e) => T(e) === r);
}
var Rs = /* @__PURE__ */ s({ patchProp: Fs }, is), zs;
function Bs() {
	return zs ||= La(Rs);
}
var Vs = ((...e) => {
	let t = Bs().createApp(...e);
	process.env.NODE_ENV !== "production" && (Us(t), Ws(t));
	let { mount: n } = t;
	return t.mount = (e) => {
		let r = Gs(e);
		if (!r) return;
		let i = t._component;
		!h(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
		let a = n(r, !1, Hs(r));
		return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), a;
	}, t;
});
function Hs(e) {
	if (e instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && e instanceof MathMLElement) return "mathml";
}
function Us(e) {
	Object.defineProperty(e.config, "isNativeTag", {
		value: (e) => be(e) || xe(e) || Se(e),
		writable: !1
	});
}
function Ws(e) {
	if (Io()) {
		let t = e.config.isCustomElement;
		Object.defineProperty(e.config, "isCustomElement", {
			get() {
				return t;
			},
			set() {
				Xo("The `isCustomElement` config option is deprecated. Use `compilerOptions.isCustomElement` instead.");
			}
		});
		let n = e.config.compilerOptions, r = "The `compilerOptions` config option is only respected when using a build of Vue.js that includes the runtime compiler (aka \"full build\"). Since you are using the runtime-only build, `compilerOptions` must be passed to `@vue/compiler-dom` in the build setup instead.\n- For vue-loader: pass it via vue-loader's `compilerOptions` loader option.\n- For vue-cli: see https://cli.vuejs.org/guide/webpack.html#modifying-options-of-a-loader\n- For vite: pass it via @vitejs/plugin-vue options. See https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue#example-for-passing-options-to-vuecompiler-sfc";
		Object.defineProperty(e.config, "compilerOptions", {
			get() {
				return Xo(r), n;
			},
			set() {
				Xo(r);
			}
		});
	}
}
function Gs(e) {
	if (g(e)) {
		let t = document.querySelector(e);
		return process.env.NODE_ENV !== "production" && !t && Xo(`Failed to mount app: mount target selector "${e}" returned null.`), t;
	}
	return process.env.NODE_ENV !== "production" && window.ShadowRoot && e instanceof window.ShadowRoot && e.mode === "closed" && Xo("mounting on a ShadowRoot with `{mode: \"closed\"}` may lead to unpredictable bugs"), e;
}
//#endregion
//#region node_modules/.pnpm/vue@3.5.43/node_modules/vue/dist/vue.runtime.esm-bundler.js
function Ks() {
	Jo();
}
process.env.NODE_ENV !== "production" && Ks();
//#endregion
//#region web/src/components/IngestTriggerPanel.vue
var qs = {
	class: "ws-block",
	"aria-label": "手动触发 ingest"
}, Js = { class: "ws-actions" }, Ys = ["disabled"], Xs = ["disabled"], Zs = {
	key: 0,
	class: "ws-note"
}, Qs = {
	key: 1,
	class: "ws-status",
	role: "status"
}, $s = {
	key: 2,
	class: "ws-status",
	role: "status"
}, ec = {
	__name: "IngestTriggerPanel",
	props: {
		state: {
			type: Object,
			required: !0
		},
		channel: {
			type: Object,
			default: null
		}
	},
	emits: ["scan", "distill"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = qo(() => n.channel?.available === !0), a = qo(() => n.state.scan.status === "running"), o = qo(() => n.state.distill.status === "running");
		return (t, n) => (Y(), X("section", qs, [
			n[2] ||= Z("h3", { class: "ws-title" }, "手动触发 ingest", -1),
			n[3] ||= Z("p", { class: "ws-note" }, [
				mo(" 双动作：「扫描增量」只跑机械面（ingest-pipeline.py scan，只读）；「触发蒸馏」呼叫 headless 任务通道（dsh-cron wiki-ingest），"),
				Z("strong", null, "蒸馏由任务执行"),
				mo("（本面板不做 LLM 蒸馏）。 ")
			], -1),
			Z("div", Js, [Z("button", {
				class: "ws-btn",
				type: "button",
				disabled: a.value,
				onClick: n[0] ||= (e) => r("scan")
			}, "扫描增量", 8, Ys), i.value ? (Y(), X("button", {
				key: 0,
				class: "ws-btn ws-btn-primary",
				type: "button",
				disabled: o.value,
				onClick: n[1] ||= (e) => r("distill")
			}, "触发蒸馏", 8, Xs)) : ho("", !0)]),
			e.channel && !i.value ? (Y(), X("p", Zs, " 蒸馏通道不可用：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill。 ")) : ho("", !0),
			e.state.scan.message ? (Y(), X("p", Qs, k(e.state.scan.message), 1)) : ho("", !0),
			e.state.distill.message ? (Y(), X("p", $s, k(e.state.distill.message), 1)) : ho("", !0)
		]));
	}
};
//#endregion
//#region web/src/lib/log-view.js
function tc(e) {
	return `${e.source}|${e.name}|${e.line}`;
}
function nc(e) {
	let t = [];
	for (let n of e) {
		let e = t[t.length - 1];
		e !== void 0 && e.source === n.source ? e.lines.push(n) : t.push({
			source: n.source,
			label: n.label,
			lines: [n]
		});
	}
	return t;
}
function rc(e, t) {
	let n = new Set(e.map(tc)), r = [];
	for (let e of t) {
		let t = tc(e);
		n.has(t) || (n.add(t), r.push(e));
	}
	return [...r, ...e];
}
function ic(e) {
	return e === "cron:wiki-ingest" ? "夜间任务" : e === "manual:scan" ? "手动扫描" : e === "alerts:kb" ? "告警账本" : e;
}
//#endregion
//#region web/src/components/IngestLogPanel.vue
var ac = {
	class: "ws-block",
	"aria-label": "ingest 日志"
}, oc = { class: "ws-title" }, sc = { class: "ws-note" }, cc = {
	key: 0,
	class: "ws-error"
}, lc = {
	key: 1,
	class: "ws-note"
}, uc = {
	class: "ws-log",
	role: "log",
	"aria-live": "polite"
}, dc = { class: "ws-log-group" }, fc = ["title"], pc = { class: "ws-tag" }, mc = { class: "ws-log-text" }, hc = {
	key: 0,
	class: "ws-tag ws-tag-dim"
}, gc = {
	key: 0,
	class: "ws-note"
}, _c = { class: "ws-actions" }, vc = {
	__name: "IngestLogPanel",
	props: {
		lines: {
			type: Array,
			required: !0
		},
		meta: {
			type: Object,
			required: !0
		},
		error: {
			type: String,
			default: ""
		}
	},
	emits: ["load-older", "reload"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = qo(() => nc(n.lines));
		return (t, n) => (Y(), X("section", ac, [
			Z("h3", oc, [n[2] ||= mo(" ingest 日志 ", -1), Z("button", {
				class: "ws-btn ws-btn-ghost",
				type: "button",
				onClick: n[0] ||= (e) => r("reload")
			}, "刷新")]),
			Z("p", sc, [n[3] ||= mo(" 来源拼接（无统一日志文件）： ", -1), (Y(!0), X(K, null, li(e.meta.sources, (e) => (Y(), X("span", {
				key: e.id,
				class: "ws-src"
			}, k(e.label), 1))), 128))]),
			e.error ? (Y(), X("p", cc, k(e.error), 1)) : ho("", !0),
			e.meta.stale ? (Y(), X("p", lc, "游标失效（日志已轮转/更新）——已回到最新视图。")) : ho("", !0),
			Z("div", uc, [(Y(!0), X(K, null, li(i.value, (e) => (Y(), X(K, { key: e.source + e.lines[0]?.name + e.lines[0]?.line }, [Z("div", dc, k(e.label), 1), (Y(!0), X(K, null, li(e.lines, (e) => (Y(), X("div", {
				key: `${e.source}|${e.name}|${e.line}`,
				class: "ws-log-line",
				title: `${e.name}:${e.line}`
			}, [
				Z("span", pc, k(rn(ic)(e.source)), 1),
				Z("span", mc, k(e.text), 1),
				e.truncated ? (Y(), X("span", hc, "截断")) : ho("", !0)
			], 8, fc))), 128))], 64))), 128)), e.lines.length === 0 && !e.error ? (Y(), X("div", gc, "暂无日志（各来源均无记录）。")) : ho("", !0)]),
			Z("div", _c, [e.meta.hasMore ? (Y(), X("button", {
				key: 0,
				class: "ws-btn",
				type: "button",
				onClick: n[1] ||= (e) => r("load-older")
			}, "加载更早")) : ho("", !0)])
		]));
	}
};
//#endregion
//#region web/src/lib/settings-model.js
function yc(e) {
	let t = e?.config ?? {}, n = e?.channel ?? {}, r = e?.sources ?? [], i = (e) => e === !0 ? "true" : e === !1 ? "false" : String(e ?? ""), a = n.available ? n.running ? "可用（任务执行中）" : "可用" : "不可用", o = n.available ? "蒸馏由任务执行（headless 任务 dsh-cron wiki-ingest）：面板只负责触发，不做 LLM 蒸馏" : "通道不可用：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill";
	return [{
		title: "wiki-steward Config（只读展示，可改项=∅）",
		rows: [
			{
				key: "vaultRoot",
				value: String(t.vaultRoot ?? ""),
				note: "捕获双轨落点根（模型不可改）",
				editable: !1
			},
			{
				key: "write.readOnly",
				value: i(t.write?.readOnly),
				note: "INV-7 默认只读：wiki_write/wiki_delete/wiki_rename 需显式开启才动手",
				editable: !1
			},
			{
				key: "capture.enabled",
				value: i(t.capture?.enabled),
				note: "会话捕获开关",
				editable: !1
			},
			{
				key: "capture.bufferRounds",
				value: i(t.capture?.bufferRounds),
				note: "缓冲轮数（每 N 轮强制双轨落盘）",
				editable: !1
			},
			{
				key: "queue.maxRetries",
				value: i(t.queue?.maxRetries),
				note: "失败幂等队列重试上限",
				editable: !1
			},
			{
				key: "queue.ttlDays",
				value: i(t.queue?.ttlDays),
				note: "队列条目 TTL（天）",
				editable: !1
			},
			{
				key: "secrets.enabled",
				value: i(t.secrets?.enabled),
				note: "落盘/注入前哨兵脱敏",
				editable: !1
			},
			{
				key: "log.sources",
				value: r.map((e) => e.label).join(" / "),
				note: "无统一日志文件——各来源拼接，逐行如实标注来源",
				editable: !1
			},
			{
				key: "distill.channel",
				value: a,
				note: o,
				editable: !1
			},
			{
				key: "distill.logFile",
				value: String(n.logFile ?? ""),
				note: "蒸馏任务日志（dsh-cron 写）",
				editable: !1
			},
			{
				key: "distill.taskFile",
				value: String(n.taskFile ?? ""),
				note: "夜间蒸馏任务指令（21-wiki-ingest）",
				editable: !1
			}
		]
	}];
}
//#endregion
//#region web/src/components/IngestSettingsPanel.vue
var bc = {
	class: "ws-block",
	"aria-label": "相关设置"
}, xc = {
	key: 0,
	class: "ws-error"
}, Sc = {
	key: 1,
	class: "ws-note"
}, Cc = { class: "ws-subtitle" }, wc = { class: "ws-rows" }, Tc = { class: "ws-row-key" }, Ec = { class: "ws-row-val" }, Dc = { class: "ws-row-value" }, Oc = { class: "ws-row-note" }, kc = {
	__name: "IngestSettingsPanel",
	props: {
		settings: {
			type: Object,
			default: null
		},
		error: {
			type: String,
			default: ""
		}
	},
	setup(e) {
		let t = e, n = qo(() => t.settings === null ? [] : yc(t.settings));
		return (t, r) => (Y(), X("section", bc, [
			r[0] ||= Z("h3", { class: "ws-title" }, "相关设置（只读展示）", -1),
			e.error ? (Y(), X("p", xc, k(e.error), 1)) : ho("", !0),
			e.settings === null && !e.error ? (Y(), X("p", Sc, "设置加载中…")) : ho("", !0),
			(Y(!0), X(K, null, li(n.value, (e) => (Y(), X(K, { key: e.title }, [Z("h4", Cc, k(e.title), 1), Z("dl", wc, [(Y(!0), X(K, null, li(e.rows, (e) => (Y(), X(K, { key: e.key }, [Z("dt", Tc, k(e.key), 1), Z("dd", Ec, [Z("span", Dc, k(e.value), 1), Z("span", Oc, k(e.note), 1)])], 64))), 128))])], 64))), 128))
		]));
	}
};
//#endregion
//#region web/src/lib/trigger-model.js
function Ac() {
	return {
		status: "idle",
		message: "",
		logFile: null,
		result: null
	};
}
function jc() {
	return {
		scan: Ac(),
		distill: Ac()
	};
}
function Mc(e, t) {
	return {
		...e,
		[t]: {
			...e[t],
			status: "running",
			message: "执行中…"
		}
	};
}
function Nc(e) {
	let t = e.summary ?? {};
	if (!e.ok) return `扫描失败（exit ${e.exitCode}）：${String(e.output ?? "").split("\n")[0] || "无输出"}`;
	if (t.unknown === !0) return "扫描完成（输出未能机械解析，原文见日志）";
	if ((t.pending ?? 0) === 0) return "扫描完成：无待编译素材";
	let n = (t.pendingFiles ?? []).filter((e) => e.status === "ingest").length, r = (t.pendingFiles ?? []).filter((e) => e.status === "re_ingest").length;
	return `扫描完成：待编译 ${t.pending} 条（新增 ${n} / 更新 ${r}），增量清单见日志`;
}
function Pc(e) {
	return String(e.note ?? "");
}
function Fc(e, t, n) {
	if (t === "scan") return {
		...e,
		scan: {
			status: n.ok ? "done" : "error",
			message: Nc(n),
			logFile: n.logFile ?? null,
			result: n
		}
	};
	let r = n.started === !0 ? "done" : n.reason === "spawn-failed" ? "error" : "skipped";
	return {
		...e,
		distill: {
			status: r,
			message: Pc(n),
			logFile: n.logFile ?? null,
			result: n
		}
	};
}
//#endregion
//#region web/src/App.vue
var Ic = { class: "ws-root" }, Lc = 200, Rc = {
	__name: "App",
	props: { api: {
		type: Object,
		required: !0
	} },
	setup(e) {
		let t = e, n = /* @__PURE__ */ en(null), r = /* @__PURE__ */ en(""), i = /* @__PURE__ */ en([]), a = /* @__PURE__ */ en({
			hasMore: !1,
			cursor: null,
			sources: [],
			stale: !1
		}), o = /* @__PURE__ */ en(""), s = /* @__PURE__ */ en(jc());
		async function c() {
			try {
				let e = await t.api.fetchLogs(Lc);
				i.value = e.lines, a.value = {
					hasMore: e.hasMore,
					cursor: e.cursor,
					sources: e.sources,
					stale: e.stale === !0
				}, o.value = "";
			} catch (e) {
				o.value = String(e?.message ?? e);
			}
		}
		async function l() {
			if (a.value.hasMore) try {
				let e = await t.api.fetchLogs(Lc, a.value.cursor);
				i.value = rc(i.value, e.lines), a.value = {
					...a.value,
					hasMore: e.hasMore,
					cursor: e.cursor,
					stale: e.stale === !0
				}, o.value = "";
			} catch (e) {
				o.value = String(e?.message ?? e);
			}
		}
		async function u() {
			try {
				n.value = await t.api.fetchSettings(), r.value = "";
			} catch (e) {
				r.value = String(e?.message ?? e);
			}
		}
		async function d() {
			s.value = Mc(s.value, "scan");
			try {
				let e = await t.api.scan();
				s.value = Fc(s.value, "scan", e), await c();
			} catch (e) {
				s.value = Fc(s.value, "scan", {
					ok: !1,
					exitCode: null,
					summary: {},
					output: String(e?.message ?? e),
					logFile: null
				});
			}
		}
		async function f() {
			s.value = Mc(s.value, "distill");
			try {
				let e = await t.api.distill();
				s.value = Fc(s.value, "distill", e);
			} catch (e) {
				s.value = Fc(s.value, "distill", {
					started: !1,
					reason: "request-failed",
					note: `触发失败：${String(e?.message ?? e)}`,
					logFile: null
				});
			}
		}
		return $r(() => {
			u(), c();
		}), (e, t) => (Y(), X("div", Ic, [
			Q(ec, {
				state: s.value,
				channel: n.value?.channel ?? null,
				onScan: d,
				onDistill: f
			}, null, 8, ["state", "channel"]),
			Q(vc, {
				lines: i.value,
				meta: a.value,
				error: o.value,
				onLoadOlder: l,
				onReload: c
			}, null, 8, [
				"lines",
				"meta",
				"error"
			]),
			Q(kc, {
				settings: n.value,
				error: r.value
			}, null, 8, ["settings", "error"])
		]));
	}
};
//#endregion
//#region web/src/api.js
async function zc(e, t = {}) {
	let n = await fetch(e, {
		...t,
		headers: {
			accept: "application/json",
			...t.headers
		}
	}), r = await n.json().catch(() => null);
	if (!n.ok) throw Error(r?.error?.message ?? `请求失败（HTTP ${n.status}）`);
	return r.data;
}
function Bc(e) {
	return {
		fetchSettings: () => zc(`${e}/ingest/settings`),
		fetchLogs: (t, n) => {
			let r = new URLSearchParams();
			t != null && r.set("limit", String(t)), n != null && r.set("cursor", String(n));
			let i = r.toString();
			return zc(`${e}/ingest/logs${i === "" ? "" : `?${i}`}`);
		},
		scan: () => zc(`${e}/ingest/scan`, { method: "POST" }),
		distill: () => zc(`${e}/ingest/distill`, { method: "POST" })
	};
}
//#endregion
//#region web/src/panel.js
var Vc = "data-wiki-steward-panel-style";
function Hc(e) {
	if (e.querySelector(`link[${Vc}]`)) return;
	let t = e.createElement("link");
	t.rel = "stylesheet", t.href = new URL("./style.css", "" + import.meta.url).href, t.setAttribute(Vc, ""), e.head.appendChild(t);
}
function Uc(e, t = {}) {
	Hc(e.ownerDocument ?? document);
	let n = Vs(Rc, { api: Bc(t.apiBase ?? "/wiki-steward/api") });
	return n.mount(e), { unmount() {
		try {
			n.unmount();
		} catch {}
		try {
			e.textContent = "";
		} catch {}
	} };
}
//#endregion
export { Uc as mount };
