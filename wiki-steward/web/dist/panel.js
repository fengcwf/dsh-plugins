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
}, l = Object.prototype.hasOwnProperty, u = (e, t) => l.call(e, t), d = Array.isArray, f = (e) => x(e) === "[object Map]", p = (e) => x(e) === "[object Set]", m = (e) => x(e) === "[object Date]", h = (e) => typeof e == "function", g = (e) => typeof e == "string", _ = (e) => typeof e == "symbol", v = (e) => typeof e == "object" && !!e, y = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch), b = Object.prototype.toString, x = (e) => b.call(e), S = (e) => x(e).slice(8, -1), C = (e) => x(e) === "[object Object]", w = (e) => g(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, T = /* @__PURE__ */ e(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), ee = /* @__PURE__ */ e("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"), te = (e) => {
	let t = /* @__PURE__ */ Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, ne = /-\w/g, E = te((e) => e.replace(ne, (e) => e.slice(1).toUpperCase())), re = /\B([A-Z])/g, D = te((e) => e.replace(re, "-$1").toLowerCase()), ie = te((e) => e.charAt(0).toUpperCase() + e.slice(1)), ae = te((e) => e ? `on${ie(e)}` : ""), O = (e, t) => !Object.is(e, t), oe = (e, ...t) => {
	for (let n = 0; n < e.length; n++) e[n](...t);
}, se = (e, t, n, r = !1) => {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		writable: r,
		value: n
	});
}, k = (e) => {
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
function he(e) {
	let t = "";
	if (g(e)) t = e;
	else if (d(e)) for (let n = 0; n < e.length; n++) {
		let r = he(e[n]);
		r && (t += r + " ");
	}
	else if (v(e)) for (let n in e) e[n] && (t += n + " ");
	return t.trim();
}
var ge = "html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot", _e = "svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view", ve = "annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics", ye = /* @__PURE__ */ e(ge), be = /* @__PURE__ */ e(_e), xe = /* @__PURE__ */ e(ve), Se = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", Ce = /* @__PURE__ */ e(Se);
Se + "";
function we(e) {
	return !!e || e === "";
}
function Te(e, t, n) {
	if (e.length !== t.length) return !1;
	let r = !0;
	for (let i = 0; r && i < e.length; i++) r = ke(e[i], t[i], n);
	return r;
}
function Ee(e, t, n) {
	if (e.size !== t.size) return !1;
	let r = Array.from(t), i = new Uint8Array(r.length);
	for (let t of e) {
		let e = -1;
		for (let a = 0; a < r.length; a++) if (!i[a] && ke(t, r[a], n)) {
			e = a;
			break;
		}
		if (e < 0) return !1;
		i[e] = 1;
	}
	return !0;
}
function De(e, t, n) {
	let r = f(e), i = f(t);
	if (r || i || (r = p(e), i = p(t), r || i)) return r && i ? Ee(e, t, n) : !1;
	if (Object.keys(e).length !== Object.keys(t).length) return !1;
	for (let r in e) {
		let i = e.hasOwnProperty(r), a = t.hasOwnProperty(r);
		if (i && !a || !i && a || !ke(e[r], t[r], n)) return !1;
	}
	return String(e) === String(t);
}
function Oe(e, t, n, r) {
	n ||= [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
	let [i, a] = n;
	if (i.has(e) || a.has(t)) return i.get(e) === t && a.get(t) === e;
	i.set(e, t), a.set(t, e);
	let o = r(e, t, n);
	return i.delete(e), a.delete(t), o;
}
function ke(e, t, n) {
	if (e === t) return !0;
	let r = m(e), i = m(t);
	return r || i ? r && i ? e.getTime() === t.getTime() : !1 : (r = _(e), i = _(t), r || i ? e === t : (r = d(e), i = d(t), r || i ? r && i ? Oe(e, t, n, Te) : !1 : (r = v(e), i = v(t), r || i ? !r || !i ? !1 : Oe(e, t, n, De) : String(e) === String(t))));
}
var Ae = (e) => !!(e && e.__v_isRef === !0), A = (e) => g(e) ? e : e == null ? "" : d(e) || v(e) && (e.toString === b || !h(e.toString)) ? Ae(e) ? A(e.value) : JSON.stringify(e, je, 2) : String(e), je = (e, t) => Ae(t) ? je(e, t.value) : f(t) ? { [`Map(${t.size})`]: [...t.entries()].reduce((e, [t, n], r) => (e[Me(t, r) + " =>"] = n, e), {}) } : p(t) ? { [`Set(${t.size})`]: [...t.values()].map((e) => Me(e)) } : _(t) ? Me(t) : v(t) && !d(t) && !C(t) ? String(t) : t, Me = (e, t = "") => _(e) ? `Symbol(${e.description ?? t})` : e;
//#endregion
//#region node_modules/.pnpm/@vue+reactivity@3.5.43/node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
function Ne(e, ...t) {
	console.warn(`[Vue warn] ${e}`, ...t);
}
var j, Pe = class {
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
		} else process.env.NODE_ENV !== "production" && this._warnOnRun && Ne("cannot run an inactive effect scope.");
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
function Fe() {
	return j;
}
var M, Ie = /* @__PURE__ */ new WeakSet(), Le = class {
	constructor(e) {
		this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, j && (j.active ? j.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, Ie.has(this) && (Ie.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Ve(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, et(this), We(this);
		let e = M, t = Xe;
		M = this, Xe = !0;
		try {
			return this.fn();
		} finally {
			process.env.NODE_ENV !== "production" && M !== this && Ne("Active effect was not restored correctly - this is likely a Vue internal bug."), Ge(this), M = e, Xe = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) Je(e);
			this.deps = this.depsTail = void 0, et(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? Ie.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		Ke(this) && this.run();
	}
	get dirty() {
		return Ke(this);
	}
}, Re = 0, ze, Be;
function Ve(e, t = !1) {
	if (e.flags |= 8, t) {
		e.next = Be, Be = e;
		return;
	}
	e.next = ze, ze = e;
}
function He() {
	Re++;
}
function Ue() {
	if (--Re > 0) return;
	if (Be) {
		let e = Be;
		for (Be = void 0; e;) {
			let t = e.next;
			e.next = void 0, e.flags &= -9, e = t;
		}
	}
	let e;
	for (; ze;) {
		let t = ze;
		for (ze = void 0; t;) {
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
function We(e) {
	for (let t = e.deps; t; t = t.nextDep) t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function Ge(e) {
	let t, n = e.depsTail, r = n;
	for (; r;) {
		let e = r.prevDep;
		r.version === -1 ? (r === n && (n = e), Je(r), Ye(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e;
	}
	e.deps = t, e.depsTail = n;
}
function Ke(e) {
	for (let t = e.deps; t; t = t.nextDep) if (t.dep.version !== t.version || t.dep.computed && (qe(t.dep.computed) || t.dep.version !== t.version)) return !0;
	return !!e._dirty;
}
function qe(e) {
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === tt) || (e.globalVersion = tt, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Ke(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = M, r = Xe;
	M = e, Xe = !0;
	try {
		We(e);
		let n = e.fn(e._value);
		(t.version === 0 || O(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		M = n, Xe = r, Ge(e), e.flags &= -3;
	}
}
function Je(e, t = !1) {
	let { dep: n, prevSub: r, nextSub: i } = e;
	if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), process.env.NODE_ENV !== "production" && n.subsHead === e && (n.subsHead = i), n.subs === e && (n.subs = r, !r && n.computed)) {
		n.computed.flags &= -5;
		for (let e = n.computed.deps; e; e = e.nextDep) Je(e, !0);
	}
	!t && !--n.sc && n.map && n.map.delete(n.key);
}
function Ye(e) {
	let { prevDep: t, nextDep: n } = e;
	t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
var Xe = !0, Ze = [];
function Qe() {
	Ze.push(Xe), Xe = !1;
}
function $e() {
	let e = Ze.pop();
	Xe = e === void 0 || e;
}
function et(e) {
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
var tt = 0, nt = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, rt = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0, process.env.NODE_ENV !== "production" && (this.subsHead = void 0);
	}
	track(e) {
		if (!M || !Xe || M === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== M) t = this.activeLink = new nt(M, this), M.deps ? (t.prevDep = M.depsTail, M.depsTail.nextDep = t, M.depsTail = t) : M.deps = M.depsTail = t, it(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = M.depsTail, t.nextDep = void 0, M.depsTail.nextDep = t, M.depsTail = t, M.deps === t && (M.deps = e);
		}
		return process.env.NODE_ENV !== "production" && M.onTrack && M.onTrack(s({ effect: M }, e)), t;
	}
	trigger(e) {
		this.version++, tt++, this.notify(e);
	}
	notify(e) {
		He();
		try {
			if (process.env.NODE_ENV !== "production") for (let t = this.subsHead; t; t = t.nextSub) t.sub.onTrigger && !(t.sub.flags & 8) && t.sub.onTrigger(s({ effect: t.sub }, e));
			for (let e = this.subs; e; e = e.prevSub) e.sub.notify() && e.sub.dep.notify();
		} finally {
			Ue();
		}
	}
};
function it(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) it(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), process.env.NODE_ENV !== "production" && e.dep.subsHead === void 0 && (e.dep.subsHead = e), e.dep.subs = e;
	}
}
var at = /* @__PURE__ */ new WeakMap(), ot = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Object iterate"), st = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Map keys iterate"), ct = /* @__PURE__ */ Symbol(process.env.NODE_ENV === "production" ? "" : "Array iterate");
function N(e, t, n) {
	if (Xe && M) {
		let r = at.get(e);
		r || at.set(e, r = /* @__PURE__ */ new Map());
		let i = r.get(n);
		i || (r.set(n, i = new rt()), i.map = r, i.key = n), process.env.NODE_ENV === "production" ? i.track() : i.track({
			target: e,
			type: t,
			key: n
		});
	}
}
function lt(e, t, n, r, i, a) {
	let o = at.get(e);
	if (!o) {
		tt++;
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
	if (He(), t === "clear") o.forEach(s);
	else {
		let i = d(e), a = i && w(n);
		if (i && n === "length") {
			let e = Number(r);
			o.forEach((t, n) => {
				(n === "length" || n === ct || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get(ct)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(ot)), f(e) && s(o.get(st)));
				break;
			case "delete":
				i || (s(o.get(ot)), f(e) && s(o.get(st)));
				break;
			case "set": f(e) && s(o.get(ot));
		}
	}
	Ue();
}
function ut(e) {
	let t = /* @__PURE__ */ I(e);
	return t === e || (N(t, "iterate", ct), /* @__PURE__ */ F(e)) ? t : /* @__PURE__ */ P(e) ? /* @__PURE__ */ Zt(e) ? t.map((e) => en(L(e))) : t.map(en) : t.map(L);
}
function dt(e) {
	return N(e = /* @__PURE__ */ I(e), "iterate", ct), e;
}
function ft(e, t) {
	return /* @__PURE__ */ P(e) ? en(/* @__PURE__ */ Zt(e) ? L(t) : t) : L(t);
}
var pt = {
	__proto__: null,
	[Symbol.iterator]() {
		return mt(this, Symbol.iterator, (e) => ft(this, e));
	},
	concat(...e) {
		return ut(this).concat(...e.map((e) => d(e) ? ut(e) : e));
	},
	entries() {
		return mt(this, "entries", (e) => (e[1] = ft(this, e[1]), e));
	},
	every(e, t) {
		return gt(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return gt(this, "filter", e, t, (e) => e.map((e) => ft(this, e)), arguments);
	},
	find(e, t) {
		return gt(this, "find", e, t, (e) => ft(this, e), arguments);
	},
	findIndex(e, t) {
		return gt(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return gt(this, "findLast", e, t, (e) => ft(this, e), arguments);
	},
	findLastIndex(e, t) {
		return gt(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return gt(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return vt(this, "includes", e);
	},
	indexOf(...e) {
		return vt(this, "indexOf", e);
	},
	join(e) {
		return ut(this).join(e);
	},
	lastIndexOf(...e) {
		return vt(this, "lastIndexOf", e);
	},
	map(e, t) {
		return gt(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return yt(this, "pop");
	},
	push(...e) {
		return yt(this, "push", e);
	},
	reduce(e, ...t) {
		return _t(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return _t(this, "reduceRight", e, t);
	},
	shift() {
		return yt(this, "shift");
	},
	some(e, t) {
		return gt(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return yt(this, "splice", e);
	},
	toReversed() {
		return ut(this).toReversed();
	},
	toSorted(e) {
		return ut(this).toSorted(e);
	},
	toSpliced(...e) {
		return ut(this).toSpliced(...e);
	},
	unshift(...e) {
		return yt(this, "unshift", e);
	},
	values() {
		return mt(this, "values", (e) => ft(this, e));
	}
};
function mt(e, t, n) {
	let r = dt(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ F(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var ht = Array.prototype;
function gt(e, t, n, r, i, a) {
	let o = dt(e), s = o !== e && !/* @__PURE__ */ F(e), c = o[t];
	if (c !== ht[t]) {
		let t = c.apply(e, a);
		return s ? L(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, ft(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function _t(e, t, n, r) {
	let i = dt(e), a = i !== e && !/* @__PURE__ */ F(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = ft(e, t)), n.call(this, t, ft(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? ft(e, c) : c;
}
function vt(e, t, n) {
	let r = /* @__PURE__ */ I(e);
	N(r, "iterate", ct);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ Qt(n[0]) ? (n[0] = /* @__PURE__ */ I(n[0]), r[t](...n)) : i;
}
function yt(e, t, n = []) {
	Qe(), He();
	let r = (/* @__PURE__ */ I(e))[t].apply(e, n);
	return Ue(), $e(), r;
}
var bt = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), xt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function St(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ I(this);
	return N(t, "has", e), t.hasOwnProperty(e);
}
var Ct = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? Wt : Ut : i ? Ht : Vt).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = pt[t])) return e;
			if (t === "hasOwnProperty") return St;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ R(e) ? e : n);
		if ((_(t) ? xt.has(t) : bt(t)) || (r || N(e, "get", t), i)) return o;
		if (/* @__PURE__ */ R(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ Jt(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ Jt(o) : /* @__PURE__ */ Kt(o) : o;
	}
}, wt = class extends Ct {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let r = /* @__PURE__ */ P(i);
			if (!/* @__PURE__ */ F(n) && !/* @__PURE__ */ P(n) && (i = /* @__PURE__ */ I(i), n = /* @__PURE__ */ I(n)), !a && /* @__PURE__ */ R(i) && !/* @__PURE__ */ R(n)) return r ? (process.env.NODE_ENV !== "production" && Ne(`Set operation on key "${String(t)}" failed: target is readonly.`, e[t]), !0) : (i.value = n, !0);
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ R(e) ? e : r);
		return e === /* @__PURE__ */ I(r) && s && (o ? O(n, i) && lt(e, "set", t, n, i) : lt(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && lt(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !xt.has(t)) && N(e, "has", t), n;
	}
	ownKeys(e) {
		return N(e, "iterate", d(e) ? "length" : ot), Reflect.ownKeys(e);
	}
}, Tt = class extends Ct {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return process.env.NODE_ENV !== "production" && Ne(`Set operation on key "${String(t)}" failed: target is readonly.`, e), !0;
	}
	deleteProperty(e, t) {
		return process.env.NODE_ENV !== "production" && Ne(`Delete operation on key "${String(t)}" failed: target is readonly.`, e), !0;
	}
}, Et = /* @__PURE__ */ new wt(), Dt = /* @__PURE__ */ new Tt(), Ot = /* @__PURE__ */ new wt(!0), kt = /* @__PURE__ */ new Tt(!0), At = (e) => e, jt = (e) => Reflect.getPrototypeOf(e);
function Mt(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ I(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? At : t ? en : L;
		return !t && N(a, "iterate", l ? st : ot), s(Object.create(u), { next() {
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
function Nt(e) {
	return function(...t) {
		if (process.env.NODE_ENV !== "production") {
			let n = t[0] ? `on key "${t[0]}" ` : "";
			Ne(`${ie(e)} operation ${n}failed: target is readonly.`, /* @__PURE__ */ I(this));
		}
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function Pt(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ I(r), a = /* @__PURE__ */ I(n);
			e || (O(n, a) && N(i, "get", n), N(i, "get", a));
			let { has: o } = jt(i), s = t ? At : e ? en : L;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && N(/* @__PURE__ */ I(t), "iterate", ot), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ I(n), i = /* @__PURE__ */ I(t);
			return e || (O(t, i) && N(r, "has", t), N(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ I(a), s = t ? At : e ? en : L;
			return !e && N(o, "iterate", ot), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: Nt("add"),
		set: Nt("set"),
		delete: Nt("delete"),
		clear: Nt("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ I(this), r = jt(n), i = /* @__PURE__ */ I(e), a = !t && !/* @__PURE__ */ F(e) && !/* @__PURE__ */ P(e) ? i : e;
			return r.has.call(n, a) || O(e, a) && r.has.call(n, e) || O(i, a) && r.has.call(n, i) || (n.add(a), lt(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ F(n) && !/* @__PURE__ */ P(n) && (n = /* @__PURE__ */ I(n));
			let r = /* @__PURE__ */ I(this), { has: i, get: a } = jt(r), o = i.call(r, e);
			o ? process.env.NODE_ENV !== "production" && Bt(r, i, e) : (e = /* @__PURE__ */ I(e), o = i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? O(n, s) && lt(r, "set", e, n, s) : lt(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ I(this), { has: n, get: r } = jt(t), i = n.call(t, e);
			i ? process.env.NODE_ENV !== "production" && Bt(t, n, e) : (e = /* @__PURE__ */ I(e), i = n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && lt(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ I(this), t = e.size !== 0, n = process.env.NODE_ENV === "production" ? void 0 : f(e) ? new Map(e) : new Set(e), r = e.clear();
			return t && lt(e, "clear", void 0, void 0, n), r;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = Mt(r, e, t);
	}), n;
}
function Ft(e, t) {
	let n = Pt(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var It = { get: /* @__PURE__ */ Ft(!1, !1) }, Lt = { get: /* @__PURE__ */ Ft(!1, !0) }, Rt = { get: /* @__PURE__ */ Ft(!0, !1) }, zt = { get: /* @__PURE__ */ Ft(!0, !0) };
function Bt(e, t, n) {
	let r = /* @__PURE__ */ I(n);
	if (r !== n && t.call(e, r)) {
		let t = S(e);
		Ne(`Reactive ${t} contains both the raw and reactive versions of the same object${t === "Map" ? " as keys" : ""}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
	}
}
var Vt = /* @__PURE__ */ new WeakMap(), Ht = /* @__PURE__ */ new WeakMap(), Ut = /* @__PURE__ */ new WeakMap(), Wt = /* @__PURE__ */ new WeakMap();
function Gt(e) {
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
function Kt(e) {
	return /* @__PURE__ */ P(e) ? e : Xt(e, !1, Et, It, Vt);
}
// @__NO_SIDE_EFFECTS__
function qt(e) {
	return Xt(e, !1, Ot, Lt, Ht);
}
// @__NO_SIDE_EFFECTS__
function Jt(e) {
	return Xt(e, !0, Dt, Rt, Ut);
}
// @__NO_SIDE_EFFECTS__
function Yt(e) {
	return Xt(e, !0, kt, zt, Wt);
}
function Xt(e, t, n, r, i) {
	if (!v(e)) return process.env.NODE_ENV !== "production" && Ne(`value cannot be made ${t ? "readonly" : "reactive"}: ${String(e)}`), e;
	if (e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = Gt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Zt(e) {
	return /* @__PURE__ */ P(e) ? /* @__PURE__ */ Zt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function P(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function F(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function Qt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ I(t) : e;
}
function $t(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && se(e, "__v_skip", !0), e;
}
var L = (e) => v(e) ? /* @__PURE__ */ Kt(e) : e, en = (e) => v(e) ? /* @__PURE__ */ Jt(e) : e;
// @__NO_SIDE_EFFECTS__
function R(e) {
	return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function tn(e) {
	return nn(e, !1);
}
function nn(e, t) {
	return /* @__PURE__ */ R(e) ? e : new rn(e, t);
}
var rn = class {
	constructor(e, t) {
		this.dep = new rt(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : /* @__PURE__ */ I(e), this._value = t ? e : L(e), this.__v_isShallow = t;
	}
	get value() {
		return process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		}), this._value;
	}
	set value(e) {
		let t = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ F(e) || /* @__PURE__ */ P(e);
		e = n ? e : /* @__PURE__ */ I(e), O(e, t) && (this._rawValue = e, this._value = n ? e : L(e), process.env.NODE_ENV === "production" ? this.dep.trigger() : this.dep.trigger({
			target: this,
			type: "set",
			key: "value",
			newValue: e,
			oldValue: t
		}));
	}
};
function an(e) {
	return /* @__PURE__ */ R(e) ? e.value : e;
}
var on = {
	get: (e, t, n) => t === "__v_raw" ? e : an(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ R(i) && !/* @__PURE__ */ R(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function sn(e) {
	return /* @__PURE__ */ Zt(e) ? e : new Proxy(e, on);
}
var cn = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new rt(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = tt - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && M !== this) return Ve(this, !0), !0;
		process.env.NODE_ENV;
	}
	get value() {
		let e = process.env.NODE_ENV === "production" ? this.dep.track() : this.dep.track({
			target: this,
			type: "get",
			key: "value"
		});
		return qe(this), e && (e.version = this.dep.version), this._value;
	}
	set value(e) {
		this.setter ? this.setter(e) : process.env.NODE_ENV !== "production" && Ne("Write operation failed: computed value is readonly");
	}
};
// @__NO_SIDE_EFFECTS__
function ln(e, t, n = !1) {
	let r, i;
	h(e) ? r = e : (r = e.get, i = e.set);
	let a = new cn(r, i, n);
	return process.env.NODE_ENV !== "production" && t && !n && (a.onTrack = t.onTrack, a.onTrigger = t.onTrigger), a;
}
var un = {}, dn = /* @__PURE__ */ new WeakMap(), fn = void 0;
function pn(e, t = !1, n = fn) {
	if (n) {
		let t = dn.get(n);
		t || dn.set(n, t = []), t.push(e);
	} else process.env.NODE_ENV !== "production" && !t && Ne("onWatcherCleanup() was called when there was no active watcher to associate with.");
}
function mn(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => {
		(i.onWarn || Ne)("Invalid watch source: ", e, "A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.");
	}, m = (e) => o ? e : /* @__PURE__ */ F(e) || o === !1 || o === 0 ? hn(e, 1) : hn(e), g, _, v, y, b = !1, x = !1;
	if (/* @__PURE__ */ R(e) ? (_ = () => e.value, b = /* @__PURE__ */ F(e)) : /* @__PURE__ */ Zt(e) ? (_ = () => m(e), b = !0) : d(e) ? (x = !0, b = e.some((e) => /* @__PURE__ */ Zt(e) || /* @__PURE__ */ F(e)), _ = () => e.map((e) => {
		if (/* @__PURE__ */ R(e)) return e.value;
		if (/* @__PURE__ */ Zt(e)) return m(e);
		if (h(e)) return f ? f(e, 2) : e();
		process.env.NODE_ENV !== "production" && p(e);
	})) : h(e) ? _ = n ? f ? () => f(e, 2) : e : () => {
		if (v) {
			Qe();
			try {
				v();
			} finally {
				$e();
			}
		}
		let t = fn;
		fn = g;
		try {
			return f ? f(e, 3, [y]) : e(y);
		} finally {
			fn = t;
		}
	} : (_ = r, process.env.NODE_ENV !== "production" && p(e)), n && o) {
		let e = _, t = o === !0 ? Infinity : o;
		_ = () => hn(e(), t);
	}
	let S = Fe(), C = () => {
		g.stop(), S && S.active && c(S.effects, g);
	};
	if (s && n) {
		let e = n;
		n = (...t) => {
			let n = e(...t);
			return C(), n;
		};
	}
	let w = x ? Array(e.length).fill(un) : un, T = (e) => {
		if (g.flags & 1 && (g.dirty || e)) {
			if (n) {
				let t = g.run();
				if (e || o || b || (x ? t.some((e, t) => O(e, w[t])) : O(t, w))) {
					v && v();
					let e = fn;
					fn = g;
					try {
						let e = [
							t,
							w === un ? void 0 : x && w[0] === un ? [] : w,
							y
						];
						w = t, f ? f(n, 3, e) : n(...e);
					} finally {
						fn = e;
					}
				}
			} else g.run();
		}
	};
	return u && u(T), g = new Le(_), g.scheduler = l ? () => l(T, !1) : T, y = (e) => pn(e, !1, g), v = g.onStop = () => {
		let e = dn.get(g);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			dn.delete(g);
		}
	}, process.env.NODE_ENV !== "production" && (g.onTrack = i.onTrack, g.onTrigger = i.onTrigger), n ? a ? T(!0) : w = g.run() : l ? l(T.bind(null, !0), !0) : g.run(), C.pause = g.pause.bind(g), C.resume = g.resume.bind(g), C.stop = C, C;
}
function hn(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ R(e)) hn(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) hn(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		hn(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) hn(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && hn(e[r], t, n);
	}
	return e;
}
//#endregion
//#region node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
var gn = [];
function _n(e) {
	gn.push(e);
}
function vn() {
	gn.pop();
}
var yn = !1;
function z(e, ...t) {
	if (yn) return;
	yn = !0, Qe();
	let n = gn.length ? gn[gn.length - 1].component : null, r = n && n.appContext.config.warnHandler, i = bn();
	if (r) En(r, n, 11, [
		e + t.map((e) => e.toString?.call(e) ?? JSON.stringify(e)).join(""),
		n && n.proxy,
		i.map(({ vnode: e }) => `at <${Go(n, e.type)}>`).join("\n"),
		i
	]);
	else {
		let n = [`[Vue warn]: ${e}`, ...t];
		i.length && n.push("\n", ...xn(i)), console.warn(...n);
	}
	$e(), yn = !1;
}
function bn() {
	let e = gn[gn.length - 1];
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
function xn(e) {
	let t = [];
	return e.forEach((e, n) => {
		t.push(...n === 0 ? [] : ["\n"], ...Sn(e));
	}), t;
}
function Sn({ vnode: e, recurseCount: t }) {
	let n = t > 0 ? `... (${t} recursive calls)` : "", r = e.component ? e.component.parent == null : !1, i = ` at <${Go(e.component, e.type, r)}`, a = ">" + n;
	return e.props ? [
		i,
		...Cn(e.props),
		a
	] : [i + a];
}
function Cn(e) {
	let t = [], n = Object.keys(e);
	return n.slice(0, 3).forEach((n) => {
		t.push(...wn(n, e[n]));
	}), n.length > 3 && t.push(" ..."), t;
}
function wn(e, t, n) {
	return g(t) ? (t = JSON.stringify(t), n ? t : [`${e}=${t}`]) : typeof t == "number" || typeof t == "boolean" || t == null ? n ? t : [`${e}=${t}`] : /* @__PURE__ */ R(t) ? (t = wn(e, /* @__PURE__ */ I(t.value), !0), n ? t : [
		`${e}=Ref<`,
		t,
		">"
	]) : h(t) ? [`${e}=fn${t.name ? `<${t.name}>` : ""}`] : (t = /* @__PURE__ */ I(t), n ? t : [`${e}=`, t]);
}
var Tn = {
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
function En(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		On(e, t, n);
	}
}
function Dn(e, t, n, r) {
	if (h(e)) {
		let i = En(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			On(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(Dn(e[a], t, n, r));
		return i;
	}
	process.env.NODE_ENV !== "production" && z(`Invalid value type passed to callWithAsyncErrorHandling(): ${typeof e}`);
}
function On(e, n, r, i = !0) {
	let a = n ? n.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: s } = n && n.appContext.config || t;
	if (n) {
		let t = n.parent, i = n.proxy, a = process.env.NODE_ENV === "production" ? `https://vuejs.org/error-reference/#runtime-${r}` : Tn[r];
		for (; t;) {
			let n = t.ec;
			if (n) {
				for (let t = 0; t < n.length; t++) if (n[t](e, i, a) === !1) return;
			}
			t = t.parent;
		}
		if (o) {
			Qe(), En(o, null, 10, [
				e,
				i,
				a
			]), $e();
			return;
		}
	}
	kn(e, r, a, i, s);
}
function kn(e, t, n, r = !0, i = !1) {
	if (process.env.NODE_ENV !== "production") {
		let i = Tn[t];
		if (n && _n(n), z(`Unhandled error${i ? ` during execution of ${i}` : ""}`), n && vn(), r) throw e;
		console.error(e);
	} else if (i) throw e;
	else console.error(e);
}
var B = [], An = -1, jn = [], Mn = null, Nn = 0, Pn = /* @__PURE__ */ Promise.resolve(), Fn = null, In = 100;
function Ln(e) {
	let t = Fn || Pn;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function Rn(e) {
	let t = An + 1, n = B.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = B[r], a = Wn(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function zn(e) {
	if (!(e.flags & 1)) {
		let t = Wn(e), n = B[B.length - 1];
		!n || !(e.flags & 2) && t >= Wn(n) ? B.push(e) : B.splice(Rn(t), 0, e), e.flags |= 1, Bn();
	}
}
function Bn() {
	Fn ||= Pn.then(Gn);
}
function Vn(e) {
	if (!d(e)) Mn && e.id === -1 ? Mn.splice(Nn + 1, 0, e) : e.flags & 1 || (jn.push(e), e.flags |= 1);
	else for (let t = 0; t < e.length; t++) jn.push(e[t]);
	Bn();
}
function Hn(e, t, n = An + 1) {
	for (process.env.NODE_ENV !== "production" && (t ||= /* @__PURE__ */ new Map()); n < B.length; n++) {
		let r = B[n];
		if (r && r.flags & 2) {
			if (e && r.id !== e.uid || process.env.NODE_ENV !== "production" && Kn(t, r)) continue;
			B.splice(n, 1), n--, r.flags & 4 && (r.flags &= -2), r(), r.flags & 4 || (r.flags &= -2);
		}
	}
}
function Un(e) {
	if (jn.length) {
		let t = [...new Set(jn)].sort((e, t) => Wn(e) - Wn(t));
		if (jn.length = 0, Mn) {
			for (let e = 0; e < t.length; e++) Mn.push(t[e]);
			return;
		}
		for (Mn = t, process.env.NODE_ENV !== "production" && (e ||= /* @__PURE__ */ new Map()), Nn = 0; Nn < Mn.length; Nn++) {
			let t = Mn[Nn];
			process.env.NODE_ENV !== "production" && Kn(e, t) || (t.flags & 4 && (t.flags &= -2), t.flags & 8 || t(), t.flags &= -2);
		}
		Mn = null, Nn = 0;
	}
}
var Wn = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function Gn(e) {
	process.env.NODE_ENV !== "production" && (e ||= /* @__PURE__ */ new Map());
	let t = process.env.NODE_ENV === "production" ? r : (t) => Kn(e, t);
	try {
		for (An = 0; An < B.length; An++) {
			let e = B[An];
			if (e && !(e.flags & 8)) {
				if (process.env.NODE_ENV !== "production" && t(e)) continue;
				e.flags & 4 && (e.flags &= -2), En(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2);
			}
		}
	} finally {
		for (; An < B.length; An++) {
			let e = B[An];
			e && (e.flags &= -2);
		}
		An = -1, B.length = 0, Un(e), Fn = null, (B.length || jn.length) && Gn(e);
	}
}
function Kn(e, t) {
	let n = e.get(t) || 0;
	if (n > In) {
		let e = t.i, n = e && Wo(e.type);
		return On(`Maximum recursive updates exceeded${n ? ` in component <${n}>` : ""}. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself. Possible sources include component template, render function, updated hook or watcher source function.`, null, 10), !0;
	}
	return e.set(t, n + 1), !1;
}
var V = !1, qn = (e) => {
	try {
		return V;
	} finally {
		V = e;
	}
}, Jn = /* @__PURE__ */ new Map();
process.env.NODE_ENV !== "production" && (le().__VUE_HMR_RUNTIME__ = {
	createRecord: rr(Qn),
	rerender: rr(er),
	reload: rr(tr)
});
var Yn = /* @__PURE__ */ new Map();
function Xn(e) {
	let t = e.type.__hmrId, n = Yn.get(t);
	n ||= (Qn(t, e.type), Yn.get(t)), n.instances.add(e);
}
function Zn(e) {
	Yn.get(e.type.__hmrId).instances.delete(e);
}
function Qn(e, t) {
	return !Yn.has(e) && (Yn.set(e, {
		initialDef: $n(t),
		instances: /* @__PURE__ */ new Set()
	}), !0);
}
function $n(e) {
	return Ko(e) ? e.__vccOpts : e;
}
function er(e, t) {
	let n = Yn.get(e);
	n && (n.initialDef.render = t, [...n.instances].forEach((e) => {
		t && (e.render = t, $n(e.type).render = t), e.renderCache = [], V = !0, e.job.flags & 8 || e.update(), V = !1;
	}));
}
function tr(e, t) {
	let n = Yn.get(e);
	if (!n) return;
	t = $n(t), nr(n.initialDef, t);
	let r = [...n.instances];
	for (let e = 0; e < r.length; e++) {
		let i = r[e], a = $n(i.type), o = Jn.get(a);
		o || (a !== n.initialDef && nr(a, t), Jn.set(a, o = /* @__PURE__ */ new Set())), o.add(i), i.appContext.propsCache.delete(i.type), i.appContext.emitsCache.delete(i.type), i.appContext.optionsCache.delete(i.type), i.ceReload ? (o.add(i), i.ceReload(t.styles), o.delete(i)) : i.parent ? zn(() => {
			i.job.flags & 8 || (V = !0, i.parent.update(), V = !1, o.delete(i));
		}) : i.appContext.reload ? i.appContext.reload() : typeof window < "u" ? window.location.reload() : console.warn("[HMR] Root or manually mounted instance modified. Full reload required."), i.root.ce && i !== i.root && i.root.ce._removeChildStyle(a);
	}
	Vn(() => {
		Jn.clear();
	});
}
function nr(e, t) {
	s(e, t);
	for (let n in e) n !== "__file" && !(n in t) && delete e[n];
}
function rr(e) {
	return (t, n) => {
		try {
			return e(t, n);
		} catch (e) {
			console.error(e), console.warn("[HMR] Something went wrong during Vue component hot-reload. Full reload required.");
		}
	};
}
var ir, ar = [], or = !1;
function sr(e, ...t) {
	ir ? ir.emit(e, ...t) : or || ar.push({
		event: e,
		args: t
	});
}
function cr(e, t) {
	ir = e, ir ? (ir.enabled = !0, ar.forEach(({ event: e, args: t }) => ir.emit(e, ...t)), ar = []) : typeof window < "u" && window.HTMLElement && !(window.navigator?.userAgent)?.includes("jsdom") ? ((t.__VUE_DEVTOOLS_HOOK_REPLAY__ = t.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((e) => {
		cr(e, t);
	}), setTimeout(() => {
		ir || (t.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, or = !0, ar = []);
	}, 3e3)) : (or = !0, ar = []);
}
function lr(e, t) {
	sr("app:init", e, t, {
		Fragment: G,
		Text: Xa,
		Comment: K,
		Static: Za
	});
}
function ur(e) {
	sr("app:unmount", e);
}
var dr = /* @__PURE__ */ hr("component:added"), fr = /* @__PURE__ */ hr("component:updated"), pr = /* @__PURE__ */ hr("component:removed"), mr = (e) => {
	ir && typeof ir.cleanupBuffer == "function" && !ir.cleanupBuffer(e) && pr(e);
};
// @__NO_SIDE_EFFECTS__
function hr(e) {
	return (t) => {
		sr(e, t.appContext.app, t.uid, t.parent ? t.parent.uid : void 0, t);
	};
}
var gr = /* @__PURE__ */ vr("perf:start"), _r = /* @__PURE__ */ vr("perf:end");
function vr(e) {
	return (t, n, r) => {
		sr(e, t.appContext.app, t.uid, t, n, r);
	};
}
function yr(e, t, n) {
	sr("component:emit", e.appContext.app, e, t, n);
}
var H = null, br = null;
function xr(e) {
	let t = H;
	return H = e, br = e && e.type.__scopeId || null, t;
}
function Sr(e, t = H, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && to(-1);
		let i = xr(t), a = Qa.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = Qa.length; e > a; e--) $a();
			xr(i), r._d && to(1);
		}
		return process.env.NODE_ENV !== "production" && fr(t), o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function Cr(e) {
	ee(e) && z("Do not use built-in directive ids as custom directive id: " + e);
}
function wr(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (Qe(), Dn(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), $e());
	}
}
function Tr(e, t) {
	if (process.env.NODE_ENV !== "production" && (!$ || $.isMounted) && z("provide() can only be used inside setup()."), $) {
		let n = $.provides, r = $.parent && $.parent.provides;
		r === n && (n = $.provides = Object.create(r)), n[e] = t;
	}
}
function Er(e, t, n = !1) {
	let r = wo();
	if (r || Bi) {
		let i = Bi ? Bi._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
		process.env.NODE_ENV !== "production" && z(`injection "${String(e)}" not found.`);
	} else process.env.NODE_ENV !== "production" && z("inject() can only be used inside setup() or functional components.");
}
var Dr = /* @__PURE__ */ Symbol.for("v-scx"), Or = () => {
	{
		let e = Er(Dr);
		return e || process.env.NODE_ENV !== "production" && z("Server rendering context not provided. Make sure to only call useSSRContext() conditionally in the server build."), e;
	}
};
function kr(e, t, n) {
	return process.env.NODE_ENV !== "production" && !h(t) && z("`watch(fn, options?)` signature has been moved to a separate API. Use `watchEffect(fn, options?)` instead. `watch` now only supports `watch(source, cb, options?) signature."), Ar(e, t, n);
}
function Ar(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i;
	process.env.NODE_ENV !== "production" && !n && (a !== void 0 && z("watch() \"immediate\" option is only respected when using the watch(source, callback, options?) signature."), o !== void 0 && z("watch() \"deep\" option is only respected when using the watch(source, callback, options?) signature."), l !== void 0 && z("watch() \"once\" option is only respected when using the watch(source, callback, options?) signature."));
	let u = s({}, i);
	process.env.NODE_ENV !== "production" && (u.onWarn = z);
	let d = n && a || !n && c !== "post", f;
	if (Mo) {
		if (c === "sync") {
			let e = Or();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = $;
	u.call = (e, t, n) => Dn(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		W(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : zn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = mn(e, n, u);
	return Mo && (f ? f.push(h) : d && h()), h;
}
function jr(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? Mr(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Do(this), s = Ar(i, a.bind(r), n);
	return o(), s;
}
function Mr(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var Nr = /* @__PURE__ */ Symbol("_vte"), Pr = (e) => e.__isTeleport, Fr = /* @__PURE__ */ Symbol("_leaveCb");
function Ir(e) {
	let t = e[0];
	if (e.length > 1) {
		let n = !1;
		for (let r of e) if (r.type !== K) {
			if (process.env.NODE_ENV !== "production" && n) {
				z("<transition> can only be used on a single element or component. Use <transition-group> for lists.");
				break;
			}
			if (t = r, n = !0, process.env.NODE_ENV === "production") break;
		}
	}
	return t;
}
function Lr(e) {
	if (!Kr(e)) return Pr(e.type) && e.children ? Ir(e.children) : e;
	if (e.component) return e.component.subTree;
	let { shapeFlag: t, children: n } = e;
	if (n) {
		if (t & 16) return n[0];
		if (t & 32 && h(n.default)) return n.default();
	}
}
function Rr(e, t) {
	if (e.shapeFlag & 6 && e.component) {
		e.transition = t;
		let n = e.component.subTree;
		Rr(Pr(n.type) && Lr(n) || n, t);
	} else e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
function zr(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
var Br = /* @__PURE__ */ new WeakSet();
function Vr(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var Hr = /* @__PURE__ */ new WeakMap();
function Ur(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => Ur(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Gr(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && Ur(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? Vo(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e;
	if (process.env.NODE_ENV !== "production" && !f) {
		z("Missing ref owner context. ref cannot be used on hoisted vnodes. A vnode with ref must be created inside the render function.");
		return;
	}
	let m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ I(v), b = v === t ? i : (e) => process.env.NODE_ENV !== "production" && (u(y, e) && !/* @__PURE__ */ R(y[e]) && z(`Template ref "${e}" used on a non-ref value. It will not work in the production build.`), Br.has(y[e])) || Vr(_, e) ? !1 : u(y, e), x = (e, t) => !(process.env.NODE_ENV !== "production" && Br.has(e) || t && Vr(_, t));
	if (m != null && m !== p) {
		if (Wr(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ R(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) En(p, f, 12, [l, _]);
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
				} else t ? (_[p] = l, b(p) && (v[p] = l)) : n ? (x(p, e.k) && (p.value = l), e.k && (_[e.k] = l)) : process.env.NODE_ENV !== "production" && z("Invalid template ref type:", p, `(${typeof p})`);
			};
			if (l) {
				let t = () => {
					i(), Hr.delete(e);
				};
				t.id = -1, Hr.set(e, t), W(t, r);
			} else Wr(e), i();
		} else process.env.NODE_ENV !== "production" && z("Invalid template ref type:", p, `(${typeof p})`);
	}
}
function Wr(e) {
	let t = Hr.get(e);
	t && (t.flags |= 8, Hr.delete(e));
}
le().requestIdleCallback, le().cancelIdleCallback;
var Gr = (e) => !!e.type.__asyncLoader, Kr = (e) => e.type.__isKeepAlive;
function qr(e, t) {
	Yr(e, "a", t);
}
function Jr(e, t) {
	Yr(e, "da", t);
}
function Yr(e, t, n = $) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (Zr(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) Kr(e.parent.vnode) && Xr(r, t, n, e), e = e.parent;
	}
}
function Xr(e, t, n, r) {
	let i = Zr(t, e, r, !0);
	ii(() => {
		c(r[t], i);
	}, n);
}
function Zr(e, t, n = $, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			Qe();
			let i = Do(n), a = Dn(t, n, e, r);
			return i(), $e(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
	process.env.NODE_ENV !== "production" && z(`${ae(Tn[e].replace(/ hook$/, ""))} is called when there is no active component instance to be associated with. Lifecycle injection APIs can only be used during execution of setup(). If you are using async setup(), make sure to register lifecycle hooks before the first await statement.`);
}
var Qr = (e) => (t, n = $) => {
	(!Mo || e === "sp") && Zr(e, (...e) => t(...e), n);
}, $r = Qr("bm"), ei = Qr("m"), ti = Qr("bu"), ni = Qr("u"), ri = Qr("bum"), ii = Qr("um"), ai = Qr("sp"), oi = Qr("rtg"), si = Qr("rtc");
function ci(e, t = $) {
	Zr("ec", e, t);
}
var li = /* @__PURE__ */ Symbol.for("v-ndc");
function ui(e, t, n, r) {
	let i, a = n && n[r], o = d(e);
	if (o || g(e)) {
		let n = o && /* @__PURE__ */ Zt(e), r = !1, s = !1;
		n && (r = !/* @__PURE__ */ F(e), s = /* @__PURE__ */ P(e), e = dt(e)), i = Array(e.length);
		for (let n = 0, o = e.length; n < o; n++) i[n] = t(r ? s ? en(L(e[n])) : L(e[n]) : e[n], n, void 0, a && a[n]);
	} else if (typeof e == "number") {
		if (process.env.NODE_ENV !== "production" && (!Number.isInteger(e) || e < 0)) z(`The v-for range expects a positive integer value but got ${e}.`), i = [];
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
var di = (e) => e ? jo(e) ? Vo(e) : di(e.parent) : null, fi = (e) => {
	let t = !1;
	for (;;) {
		if (e.patchFlag > 0 && e.patchFlag & 2048) {
			let n = Xi(e.children);
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
}, pi = (e) => {
	let t = e.subTree && fi(e.subTree);
	return t === void 0 ? e.vnode.el : t;
}, mi = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => process.env.NODE_ENV === "production" ? e.vnode.el : pi(e),
	$data: (e) => e.data,
	$props: (e) => process.env.NODE_ENV === "production" ? e.props : /* @__PURE__ */ Yt(e.props),
	$attrs: (e) => process.env.NODE_ENV === "production" ? e.attrs : /* @__PURE__ */ Yt(e.attrs),
	$slots: (e) => process.env.NODE_ENV === "production" ? e.slots : /* @__PURE__ */ Yt(e.slots),
	$refs: (e) => process.env.NODE_ENV === "production" ? e.refs : /* @__PURE__ */ Yt(e.refs),
	$parent: (e) => di(e.parent),
	$root: (e) => di(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => Oi(e),
	$forceUpdate: (e) => e.f ||= () => {
		zn(e.update);
	},
	$nextTick: (e) => e.n ||= Ln.bind(e.proxy),
	$watch: (e) => jr.bind(e)
}), hi = (e) => e === "_" || e === "$", gi = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), _i = {
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
			else if (gi(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else Ci && (s[n] = 0);
		}
		let d = mi[n], f, p;
		if (d) return n === "$attrs" ? (N(e.attrs, "get", ""), process.env.NODE_ENV !== "production" && qi()) : process.env.NODE_ENV !== "production" && n === "$slots" && N(e, "get", n), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
		process.env.NODE_ENV !== "production" && H && (!g(n) || n.indexOf("__v") !== 0) && (a !== t && hi(n[0]) && u(a, n) ? z(`Property ${JSON.stringify(n)} must be accessed via $data because it starts with a reserved character ("$" or "_") and is not proxied on the render context.`) : e === H && z(`Property ${JSON.stringify(n)} was accessed during render but is not defined on instance.`));
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return gi(a, n) ? (a[n] = r, !0) : process.env.NODE_ENV !== "production" && a.__isScriptSetup && u(a, n) ? (z(`Cannot mutate <script setup> binding "${n}" from Options API.`), !1) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) ? (process.env.NODE_ENV !== "production" && z(`Attempting to mutate prop "${n}". Props are readonly.`), !1) : n[0] === "$" && n.slice(1) in e ? (process.env.NODE_ENV !== "production" && z(`Attempting to mutate public property "${n}". Properties starting with $ are reserved and readonly.`), !1) : (process.env.NODE_ENV !== "production" && n in e.appContext.config.globalProperties ? Object.defineProperty(o, n, {
			enumerable: !0,
			configurable: !0,
			value: r
		}) : o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || gi(n, c) || u(o, c) || u(i, c) || u(mi, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
process.env.NODE_ENV !== "production" && (_i.ownKeys = (e) => (z("Avoid app logic that relies on enumerating keys on a component instance. The keys will be empty in production mode to avoid performance overhead."), Reflect.ownKeys(e)));
function vi(e) {
	let t = {};
	return Object.defineProperty(t, "_", {
		configurable: !0,
		enumerable: !1,
		get: () => e
	}), Object.keys(mi).forEach((n) => {
		Object.defineProperty(t, n, {
			configurable: !0,
			enumerable: !1,
			get: () => mi[n](e),
			set: r
		});
	}), t;
}
function yi(e) {
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
function bi(e) {
	let { ctx: t, setupState: n } = e;
	Object.keys(/* @__PURE__ */ I(n)).forEach((e) => {
		if (!n.__isScriptSetup) {
			if (hi(e[0])) {
				z(`setup() return property ${JSON.stringify(e)} should not start with "$" or "_" which are reserved prefixes for Vue internals.`);
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
function xi(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
function Si() {
	let e = /* @__PURE__ */ Object.create(null);
	return (t, n) => {
		e[n] ? z(`${t} property "${n}" is already defined in ${e[n]}.`) : e[n] = t;
	};
}
var Ci = !0;
function wi(e) {
	let t = Oi(e), n = e.proxy, i = e.ctx;
	Ci = !1, t.beforeCreate && Ei(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: b, deactivated: x, beforeDestroy: S, beforeUnmount: C, destroyed: w, unmounted: T, render: ee, renderTracked: te, renderTriggered: ne, errorCaptured: E, serverPrefetch: re, expose: D, inheritAttrs: ie, components: ae, directives: O, filters: oe } = t, se = process.env.NODE_ENV === "production" ? null : Si();
	if (process.env.NODE_ENV !== "production") {
		let [t] = e.propsOptions;
		if (t) for (let e in t) se("Props", e);
	}
	if (u && Ti(u, i, se), s) for (let e in s) {
		let t = s[e];
		h(t) ? (process.env.NODE_ENV === "production" ? i[e] = t.bind(n) : Object.defineProperty(i, e, {
			value: t.bind(n),
			configurable: !0,
			enumerable: !0,
			writable: !0
		}), process.env.NODE_ENV !== "production" && se("Methods", e)) : process.env.NODE_ENV !== "production" && z(`Method "${e}" has type "${typeof t}" in the component definition. Did you reference the function correctly?`);
	}
	if (a) {
		process.env.NODE_ENV !== "production" && !h(a) && z("The data option must be a function. Plain object usage is no longer supported.");
		let t = a.call(n, n);
		if (process.env.NODE_ENV !== "production" && y(t) && z("data() returned a Promise - note data() cannot be async; If you intend to perform data fetching before component renders, use async setup() + <Suspense>."), !v(t)) process.env.NODE_ENV !== "production" && z("data() should return an object.");
		else if (e.data = /* @__PURE__ */ Kt(t), process.env.NODE_ENV !== "production") for (let e in t) se("Data", e), hi(e[0]) || Object.defineProperty(i, e, {
			configurable: !0,
			enumerable: !0,
			get: () => t[e],
			set: r
		});
	}
	if (Ci = !0, o) for (let e in o) {
		let t = o[e], a = h(t) ? t.bind(n, n) : h(t.get) ? t.get.bind(n, n) : r;
		process.env.NODE_ENV !== "production" && a === r && z(`Computed property "${e}" has no getter.`);
		let s = qo({
			get: a,
			set: !h(t) && h(t.set) ? t.set.bind(n) : process.env.NODE_ENV === "production" ? r : () => {
				z(`Write operation failed: computed property "${e}" is readonly.`);
			}
		});
		Object.defineProperty(i, e, {
			enumerable: !0,
			configurable: !0,
			get: () => s.value,
			set: (e) => s.value = e
		}), process.env.NODE_ENV !== "production" && se("Computed", e);
	}
	if (c) for (let e in c) Di(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			Tr(t, e[t]);
		});
	}
	f && Ei(f, e, "c");
	function k(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (k($r, p), k(ei, m), k(ti, g), k(ni, _), k(qr, b), k(Jr, x), k(ci, E), k(si, te), k(oi, ne), k(ri, C), k(ii, T), k(ai, re), d(D)) {
		if (D.length) {
			let t = e.exposed ||= {};
			D.forEach((e) => {
				Object.defineProperty(t, e, {
					get: () => n[e],
					set: (t) => n[e] = t,
					enumerable: !0
				});
			});
		} else e.exposed ||= {};
	}
	ee && e.render === r && (e.render = ee), ie != null && (e.inheritAttrs = ie), ae && (e.components = ae), O && (e.directives = O), re && zr(e);
}
function Ti(e, t, n = r) {
	d(e) && (e = Ni(e));
	for (let r in e) {
		let i = e[r], a;
		a = v(i) ? "default" in i ? Er(i.from || r, i.default, !0) : Er(i.from || r) : Er(i), /* @__PURE__ */ R(a) ? Object.defineProperty(t, r, {
			enumerable: !0,
			configurable: !0,
			get: () => a.value,
			set: (e) => a.value = e
		}) : t[r] = a, process.env.NODE_ENV !== "production" && n("Inject", r);
	}
}
function Ei(e, t, n) {
	Dn(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function Di(e, t, n, r) {
	let i = r.includes(".") ? Mr(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) ? kr(i, n) : process.env.NODE_ENV !== "production" && z(`Invalid watch handler specified by key "${e}"`, n);
	} else if (h(e)) kr(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => Di(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) ? kr(i, r, e) : process.env.NODE_ENV !== "production" && z(`Invalid watch handler specified by key "${e.handler}"`, r);
		}
	} else process.env.NODE_ENV !== "production" && z(`Invalid watch option: "${r}"`, e);
}
function Oi(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => ki(c, e, o, !0)), ki(c, t, o)), v(t) && a.set(t, c), c;
}
function ki(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && ki(e, a, n, !0), i && i.forEach((t) => ki(e, t, n, !0));
	for (let i in t) if (r && i === "expose") process.env.NODE_ENV !== "production" && z("\"expose\" option is ignored when declared in mixins or extends. It should only be declared in the base component itself.");
	else {
		let r = Ai[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var Ai = {
	data: ji,
	props: Fi,
	emits: Fi,
	methods: Pi,
	computed: Pi,
	beforeCreate: U,
	created: U,
	beforeMount: U,
	mounted: U,
	beforeUpdate: U,
	updated: U,
	beforeDestroy: U,
	beforeUnmount: U,
	destroyed: U,
	unmounted: U,
	activated: U,
	deactivated: U,
	errorCaptured: U,
	serverPrefetch: U,
	components: Pi,
	directives: Pi,
	watch: Ii,
	provide: ji,
	inject: Mi
};
function ji(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function Mi(e, t) {
	return Pi(Ni(e), Ni(t));
}
function Ni(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function U(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function Pi(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function Fi(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), xi(e), xi(t ?? {})) : t;
}
function Ii(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = U(e[r], t[r]);
	return n;
}
function Li() {
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
var Ri = 0;
function zi(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (process.env.NODE_ENV !== "production" && z("root props passed to app.mount() must be an object."), r = null);
		let i = Li(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: Ri++,
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
				process.env.NODE_ENV !== "production" && z("app.config cannot be replaced. Modify individual options instead.");
			},
			use(e, ...t) {
				return a.has(e) ? process.env.NODE_ENV !== "production" && z("Plugin has already been applied to target app.") : e && h(e.install) ? (a.add(e), e.install(l, ...t)) : h(e) ? (a.add(e), e(l, ...t)) : process.env.NODE_ENV !== "production" && z("A plugin must either be a function or an object with an \"install\" function."), l;
			},
			mixin(e) {
				return i.mixins.includes(e) ? process.env.NODE_ENV !== "production" && z("Mixin has already been applied to target app" + (e.name ? `: ${e.name}` : "")) : i.mixins.push(e), l;
			},
			component(e, t) {
				return process.env.NODE_ENV !== "production" && Ao(e, i.config), t ? (process.env.NODE_ENV !== "production" && i.components[e] && z(`Component "${e}" has already been registered in target app.`), i.components[e] = t, l) : i.components[e];
			},
			directive(e, t) {
				return process.env.NODE_ENV !== "production" && Cr(e), t ? (process.env.NODE_ENV !== "production" && i.directives[e] && z(`Directive "${e}" has already been registered in target app.`), i.directives[e] = t, l) : i.directives[e];
			},
			mount(a, o, s) {
				if (c) process.env.NODE_ENV !== "production" && z("App has already been mounted.\nIf you want to remount the same app, move your app creation logic into a factory function and create fresh app instances for each mount - e.g. `const createMyApp = () => createApp(App)`");
				else {
					process.env.NODE_ENV !== "production" && a.__vue_app__ && z("There is already an app instance mounted on the host container.\n If you want to mount another app on the same host container, you need to unmount the previous app by calling `app.unmount()` first.");
					let u = l._ceVNode || Z(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), process.env.NODE_ENV !== "production" && (i.reload = () => {
						let t = po(u);
						t.el = null, e(t, a, s);
					}), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, process.env.NODE_ENV !== "production" && (l._instance = u.component, lr(l, Yo)), Vo(u.component);
				}
			},
			onUnmount(e) {
				process.env.NODE_ENV !== "production" && typeof e != "function" && z(`Expected function as first argument to app.onUnmount(), but got ${typeof e}`), o.push(e);
			},
			unmount() {
				c ? (Dn(o, l._instance, 16), e(null, l._container), process.env.NODE_ENV !== "production" && (l._instance = null, ur(l)), delete l._container.__vue_app__) : process.env.NODE_ENV !== "production" && z("Cannot unmount an app that is not mounted.");
			},
			provide(e, t) {
				return process.env.NODE_ENV !== "production" && e in i.provides && (u(i.provides, e) ? z(`App already provides property with key "${String(e)}". It will be overwritten with the new value.`) : z(`App already provides property with key "${String(e)}" inherited from its parent element. It will be overwritten with the new value.`)), i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = Bi;
				Bi = l;
				try {
					return e();
				} finally {
					Bi = t;
				}
			}
		};
		return l;
	};
}
var Bi = null, Vi = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${E(t)}Modifiers`] || e[`${D(t)}Modifiers`];
function Hi(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t;
	if (process.env.NODE_ENV !== "production") {
		let { emitsOptions: t, propsOptions: [i] } = e;
		if (t) {
			if (!(n in t)) (!i || !(ae(E(n)) in i)) && z(`Component emitted event "${n}" but it is neither declared in the emits option nor as an "${ae(E(n))}" prop.`);
			else {
				let e = t[n];
				h(e) && (e(...r) || z(`Invalid event arguments: event validation failed for event "${n}".`));
			}
		}
	}
	let a = r, o = n.startsWith("update:"), s = o && Vi(i, n.slice(7));
	if (s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = a.map(k))), process.env.NODE_ENV !== "production" && yr(e, n, a), process.env.NODE_ENV !== "production") {
		let t = n.toLowerCase();
		t !== n && i[ae(t)] && z(`Event "${t}" is emitted in component ${Go(e, e.type)} but the handler is registered for "${n}". Note that HTML attributes are case-insensitive and you cannot use v-on to listen to camelCase events when using in-DOM templates. You should probably use "${D(n)}" instead of "${n}".`);
	}
	let c, l = i[c = ae(n)] || i[c = ae(E(n))];
	!l && o && (l = i[c = ae(D(n))]), l && Dn(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, Dn(u, e, 6, a);
	}
}
var Ui = /* @__PURE__ */ new WeakMap();
function Wi(e, t, n = !1) {
	let r = n ? Ui : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Wi(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function Gi(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, D(t)) || u(e, t));
}
var Ki = !1;
function qi() {
	Ki = !0;
}
function Ji(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [s], slots: c, attrs: l, emit: u, render: d, renderCache: f, props: p, data: m, setupState: h, ctx: g, inheritAttrs: _ } = e, v = xr(e), y, b;
	process.env.NODE_ENV !== "production" && (Ki = !1);
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = process.env.NODE_ENV !== "production" && h.__isScriptSetup ? new Proxy(e, { get(e, t, n) {
				return z(`Property '${String(t)}' was accessed via 'this'. Avoid using 'this' in templates.`), Reflect.get(e, t, n);
			} }) : e;
			y = Q(d.call(t, e, f, process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Yt(p), h, m, g)), b = l;
		} else {
			let e = t;
			process.env.NODE_ENV !== "production" && l === p && qi(), y = Q(e.length > 1 ? e(process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Yt(p), process.env.NODE_ENV === "production" ? {
				attrs: l,
				slots: c,
				emit: u
			} : {
				get attrs() {
					return qi(), /* @__PURE__ */ Yt(l);
				},
				slots: c,
				emit: u
			}) : e(process.env.NODE_ENV === "production" ? p : /* @__PURE__ */ Yt(p), null)), b = t.props ? l : Zi(l);
		}
	} catch (t) {
		Qa.length = 0, On(t, e, 1), y = Z(K);
	}
	let x = y, S;
	if (process.env.NODE_ENV !== "production" && y.patchFlag > 0 && y.patchFlag & 2048 && ([x, S] = Yi(y)), b && _ !== !1) {
		let e = Object.keys(b), { shapeFlag: t } = x;
		if (e.length) {
			if (t & 7) s && e.some(o) && (b = Qi(b, s)), x = po(x, b, !1, !0);
			else if (process.env.NODE_ENV !== "production" && !Ki && x.type !== K) {
				let e = Object.keys(l), t = [], n = [];
				for (let r = 0, i = e.length; r < i; r++) {
					let i = e[r];
					a(i) ? o(i) || t.push(i[2].toLowerCase() + i.slice(3)) : n.push(i);
				}
				n.length && z(`Extraneous non-props attributes (${n.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.`), t.length && z(`Extraneous non-emits event listeners (${t.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text root nodes. If the listener is intended to be a component custom event listener only, declare it using the "emits" option.`);
			}
		}
	}
	if (n.dirs && (process.env.NODE_ENV !== "production" && !$i(x) && z("Runtime directive used on component with non-element root node. The directives will not function as intended."), x = po(x, null, !1, !0), x.dirs = x.dirs ? x.dirs.concat(n.dirs) : n.dirs), n.transition) {
		let e = Pr(x.type) && Lr(x) || x;
		process.env.NODE_ENV !== "production" && !$i(e) && z("Component inside <Transition> renders non-element root node that cannot be animated."), Rr(e, n.transition);
	}
	return process.env.NODE_ENV !== "production" && S ? S(x) : y = x, xr(v), y;
}
var Yi = (e) => {
	let t = e.children, n = e.dynamicChildren, r = Xi(t, !1);
	if (!r) return [e, void 0];
	if (process.env.NODE_ENV !== "production" && r.patchFlag > 0 && r.patchFlag & 2048) return Yi(r);
	let i = t.indexOf(r), a = n ? n.indexOf(r) : -1;
	return [Q(r), (r) => {
		t[i] = r, n && (a > -1 ? n[a] = r : r.patchFlag > 0 && (e.dynamicChildren = [...n, r]));
	}];
};
function Xi(e, t = !0) {
	let n;
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		if (io(i)) {
			if (i.type !== K || i.children === "v-if") {
				if (n) return;
				if (n = i, process.env.NODE_ENV !== "production" && t && n.patchFlag > 0 && n.patchFlag & 2048) return Xi(n.children);
			}
		} else return;
	}
	return n;
}
var Zi = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, Qi = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
}, $i = (e) => e.shapeFlag & 7 || e.type === K;
function ea(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (process.env.NODE_ENV !== "production" && (i || s) && V || t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? ta(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (na(o, r, n) && !Gi(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || ta(r, o, l) : !!o;
	return !1;
}
function ta(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (na(t, e, a) && !Gi(n, a)) return !0;
	}
	return !1;
}
function na(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !ke(r, i) : r !== i;
}
function ra({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var ia = {}, aa = () => Object.create(ia), oa = (e) => Object.getPrototypeOf(e) === ia;
function sa(e, t, n, r = !1) {
	let i = {}, a = aa();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), ua(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	process.env.NODE_ENV !== "production" && ga(t || {}, i, e), e.props = n ? r ? i : /* @__PURE__ */ qt(i) : e.type.props ? i : a, e.attrs = a;
}
function ca(e) {
	for (; e;) {
		if (e.type.__hmrId) return !0;
		e = e.parent;
	}
}
function la(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ I(i), [c] = e.propsOptions, l = !1;
	if (!(process.env.NODE_ENV !== "production" && ca(e)) && (r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (Gi(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = E(o);
						i[t] = da(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		ua(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = D(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = da(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && lt(e.attrs, "set", ""), process.env.NODE_ENV !== "production" && ga(t || {}, i, e);
}
function ua(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (T(t)) continue;
		let l = n[t], d;
		a && u(a, d = E(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : Gi(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ I(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = da(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function da(e, t, n, r, i, a) {
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
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === D(n)) && (r = !0));
	}
	return r;
}
var fa = /* @__PURE__ */ new WeakMap();
function pa(e, r, i = !1) {
	let a = i ? fa : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = pa(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		process.env.NODE_ENV !== "production" && !g(c[e]) && z("props must be strings when using array syntax.", c[e]);
		let n = E(c[e]);
		ma(n) && (l[n] = t);
	}
	else if (c) {
		process.env.NODE_ENV !== "production" && !v(c) && z("invalid props options", c);
		for (let e in c) {
			let t = E(e);
			if (ma(t)) {
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
function ma(e) {
	return e[0] !== "$" && !T(e) || (process.env.NODE_ENV !== "production" && z(`Invalid prop name: "${e}" is a reserved property.`), !1);
}
function ha(e) {
	return e === null ? "null" : typeof e == "function" ? e.name || "" : typeof e == "object" && e.constructor && e.constructor.name || "";
}
function ga(e, t, n) {
	let r = /* @__PURE__ */ I(t), i = n.propsOptions[0], a = Object.keys(e).map((e) => E(e));
	for (let e in i) {
		let t = i[e];
		t != null && _a(e, r[e], t, process.env.NODE_ENV === "production" ? r : /* @__PURE__ */ Yt(r), !a.includes(e));
	}
}
function _a(e, t, n, r, i) {
	let { type: a, required: o, validator: s, skipCheck: c } = n;
	if (o && i) {
		z("Missing required prop: \"" + e + "\"");
		return;
	}
	if (t != null || o) {
		if (a != null && a !== !0 && !c) {
			let n = !1, r = d(a) ? a : [a], i = [];
			for (let e = 0; e < r.length && !n; e++) {
				let { valid: a, expectedType: o } = ya(t, r[e]);
				i.push(o || ""), n = a;
			}
			if (!n) {
				z(ba(e, t, i));
				return;
			}
		}
		s && !s(t, r) && z("Invalid prop: custom validator check failed for prop \"" + e + "\".");
	}
}
var va = /* @__PURE__ */ e("String,Number,Boolean,Function,Symbol,BigInt");
function ya(e, t) {
	let n, r = ha(t);
	if (r === "null") n = e === null;
	else if (va(r)) {
		let i = typeof e;
		n = i === r.toLowerCase(), !n && i === "object" && (n = e instanceof t);
	} else n = r === "Object" ? v(e) : r === "Array" ? d(e) : e instanceof t;
	return {
		valid: n,
		expectedType: r
	};
}
function ba(e, t, n) {
	if (n.length === 0) return `Prop type [] for prop "${e}" won't match anything. Did you mean to use type Array instead?`;
	let r = `Invalid prop: type check failed for prop "${e}". Expected ${n.map(ie).join(" | ")}`, i = n[0], a = S(t), o = xa(t, i), s = xa(t, a);
	return n.length === 1 && Sa(i) && Ca(i, a) && (r += ` with value ${o}`), r += `, got ${a} `, Sa(a) && (r += `with value ${s}.`), r;
}
function xa(e, t) {
	return _(e) ? e.toString() : t === "String" ? `"${e}"` : t === "Number" ? `${Number(e)}` : `${e}`;
}
function Sa(e) {
	return [
		"string",
		"number",
		"boolean"
	].some((t) => e.toLowerCase() === t);
}
function Ca(...e) {
	return e.every((e) => {
		let t = e.toLowerCase();
		return t !== "boolean" && t !== "symbol";
	});
}
var wa = (e) => e === "_" || e === "_ctx" || e === "$stable", Ta = (e) => d(e) ? e.map(Q) : [Q(e)], Ea = (e, t, n) => {
	if (t._n) return t;
	let r = Sr((...r) => (process.env.NODE_ENV !== "production" && $ && !(n === null && H) && !(n && n.root !== $.root) && z(`Slot "${e}" invoked outside of the render function: this will not track dependencies used in the slot. Invoke the slot function inside the render function instead.`), Ta(t(...r))), n);
	return r._c = !1, r;
}, Da = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (wa(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = Ea(n, i, r);
		else if (i != null) {
			process.env.NODE_ENV !== "production" && z(`Non-function value encountered for slot "${n}". Prefer function slots for better performance.`);
			let e = Ta(i);
			t[n] = () => e;
		}
	}
}, Oa = (e, t) => {
	process.env.NODE_ENV !== "production" && !Kr(e.vnode) && z("Non-function value encountered for default slot. Prefer function slots for better performance.");
	let n = Ta(t);
	e.slots.default = () => n;
}, ka = (e, t, n) => {
	for (let r in t) (n || !wa(r)) && (e[r] = t[r]);
}, Aa = (e, t, n) => {
	let r = e.slots = aa();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (ka(r, t, n), n && se(r, "_", e, !0)) : Da(t, r);
	} else t && Oa(e, t);
}, ja = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let t = n._;
		t ? process.env.NODE_ENV !== "production" && V ? (ka(a, n, r), lt(e, "set", "$slots")) : r && t === 1 ? o = !1 : ka(a, n, r) : (o = !n.$stable, Da(n, a)), s = n;
	} else n && (Oa(e, n), s = { default: 1 });
	if (o) for (let e in a) !wa(e) && s[e] == null && delete a[e];
}, Ma, Na;
function Pa(e, t) {
	e.appContext.config.performance && Ia() && Na.mark(`vue-${t}-${e.uid}`), process.env.NODE_ENV !== "production" && gr(e, t, Ia() ? Na.now() : Date.now());
}
function Fa(e, t) {
	if (e.appContext.config.performance && Ia()) {
		let n = `vue-${t}-${e.uid}`, r = n + ":end", i = `<${Go(e, e.type)}> ${t}`;
		Na.mark(r), Na.measure(i, n, r), Na.clearMeasures(i), Na.clearMarks(n), Na.clearMarks(r);
	}
	process.env.NODE_ENV !== "production" && _r(e, t, Ia() ? Na.now() : Date.now());
}
function Ia() {
	return Ma === void 0 && (typeof window < "u" && window.performance ? (Ma = !0, Na = window.performance) : Ma = !1), Ma;
}
function La() {
	let e = [];
	if (process.env.NODE_ENV !== "production" && e.length) {
		let t = e.length > 1;
		console.warn(`Feature flag${t ? "s" : ""} ${e.join(", ")} ${t ? "are" : "is"} not explicitly defined. You are running the esm-bundler build of Vue, which expects these compile-time feature flags to be globally injected via the bundler config in order to get better tree-shaking in the production bundle.

For more details, see https://link.vuejs.org/feature-flags.`);
	}
}
var W = Ya;
function Ra(e) {
	return za(e);
}
function za(e, i) {
	La();
	let a = le();
	a.__VUE__ = !0, process.env.NODE_ENV !== "production" && cr(a.__VUE_DEVTOOLS_GLOBAL_HOOK__, a);
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, r, i = null, a = null, o = null, s = void 0, c = null, l = process.env.NODE_ENV !== "production" && V ? !1 : !!t.dynamicChildren) => {
		if (e === t) return;
		e && !ao(e, t) && (i = xe(e), ge(e, a, o, !0), e = null), t.patchFlag === -2 && (l = !1, t.dynamicChildren = null), t.dynamicChildren && e && e.dynamicChildren && e.dynamicChildren.hasOnce && (t.dynamicChildren === n && (t.dynamicChildren = []), t.dynamicChildren.hasOnce = !0);
		let { type: u, ref: d, shapeFlag: f } = t;
		switch (u) {
			case Xa:
				y(e, t, r, i);
				break;
			case K:
				b(e, t, r, i);
				break;
			case Za:
				e == null ? x(t, r, i, s) : process.env.NODE_ENV !== "production" && S(e, t, r, s);
				break;
			case G:
				ae(e, t, r, i, a, o, s, c, l);
				break;
			default: f & 1 ? ee(e, t, r, i, a, o, s, c, l) : f & 6 ? O(e, t, r, i, a, o, s, c, l) : f & 64 || f & 128 ? u.process(e, t, r, i, a, o, s, c, l, we) : process.env.NODE_ENV !== "production" && z("Invalid VNode type:", u, `(${typeof u})`);
		}
		d != null && a ? Ur(d, e && e.ref, o, t || e, !t) : d == null && e && e.ref != null && Ur(e.ref, null, o, e, !0);
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
	}, ee = (e, t, n, r, i, a, o, s, c) => {
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
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && E(e.children, d, null, r, i, Ba(e, a), s, u), _ && wr(e, null, r, "created"), ne(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !T(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && bo(f, r, e);
		}
		process.env.NODE_ENV !== "production" && (se(d, "__vnode", e, !0), se(d, "__vueParentComponent", r, !0)), _ && wr(e, null, r, "beforeMount");
		let v = Ha(i, g);
		if (v && g.beforeEnter(d), o(d, t, n), (f = m && m.onVnodeMounted) || v || _) {
			let t = process.env.NODE_ENV !== "production" && V;
			W(() => {
				let n;
				process.env.NODE_ENV !== "production" && (n = qn(t));
				try {
					f && bo(f, r, e), v && g.enter(d), _ && wr(e, null, r, "mounted");
				} finally {
					process.env.NODE_ENV !== "production" && qn(n);
				}
			}, i);
		}
	}, ne = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (process.env.NODE_ENV !== "production" && n.patchFlag > 0 && n.patchFlag & 2048 && (n = Xi(n.children) || n), t === n || Ja(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				ne(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, E = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? _o(e[l]) : Q(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, re = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el;
		process.env.NODE_ENV !== "production" && (l.__vnode = n);
		let { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && Va(r, !1), (g = h.onVnodeBeforeUpdate) && bo(g, r, n, e), f && wr(n, e, r, "beforeUpdate"), r && Va(r, !0), (process.env.NODE_ENV !== "production" && V || d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length)) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? (D(e.dynamicChildren, d, l, r, i, Ba(n, a), o), process.env.NODE_ENV !== "production" && Ua(e, n)) : s || fe(e, n, l, null, r, i, Ba(n, a), o, !1), u > 0) {
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
		((g = h.onVnodeUpdated) || f) && W(() => {
			g && bo(g, r, n, e), f && wr(n, e, r, "updated");
		}, i);
	}, D = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === G || !ao(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
			v(c, l, u, null, r, i, a, o, !0);
		}
	}, ie = (e, n, r, i, a) => {
		if (n !== r) {
			if (n !== t) for (let t in n) !T(t) && !(t in r) && c(e, t, n[t], null, a, i);
			for (let t in r) {
				if (T(t)) continue;
				let o = r[t], s = n[t];
				o !== s && t !== "value" && c(e, t, s, o, a, i);
			}
			"value" in r && c(e, "value", n.value, r.value, a);
		}
	}, ae = (e, t, n, r, i, a, s, c, l) => {
		let d = t.el = e ? e.el : u(""), f = t.anchor = e ? e.anchor : u(""), { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t;
		process.env.NODE_ENV !== "production" && (V || p & 2048) && (p = 0, l = !1, m = null), h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), E(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (D(e.dynamicChildren, m, n, i, a, s, c), process.env.NODE_ENV === "production" ? (t.key != null || i && t === i.subTree) && Ua(e, t, !0) : Ua(e, t)) : fe(e, t, n, f, i, a, s, c, l);
	}, O = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : k(t, n, r, i, a, o, c) : ce(e, t, c);
	}, k = (e, t, n, r, i, a, o) => {
		let s = e.component = Co(e, r, i);
		if (process.env.NODE_ENV !== "production" && s.type.__hmrId && Xn(s), process.env.NODE_ENV !== "production" && (_n(e), Pa(s, "mount")), Kr(e) && (s.ctx.renderer = we), process.env.NODE_ENV !== "production" && Pa(s, "init"), No(s, !1, o), process.env.NODE_ENV !== "production" && Fa(s, "init"), process.env.NODE_ENV !== "production" && V && (e.el = null), s.asyncDep) {
			if (i && i.registerDep(s, ue, o), !e.el) {
				let r = s.subTree = Z(K);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else ue(s, e, t, n, i, a, o);
		process.env.NODE_ENV !== "production" && (vn(), Fa(s, "mount"));
	}, ce = (e, t, n) => {
		let r = t.component = e.component;
		if (ea(e, t, n)) {
			if (r.asyncDep && !r.asyncResolved) {
				process.env.NODE_ENV !== "production" && _n(t), t.el = e.el, de(r, t, n), process.env.NODE_ENV !== "production" && vn();
				return;
			}
			r.next = t, r.update();
		} else t.el = e.el, r.vnode = t;
	}, ue = (e, t, n, r, i, a, o) => {
		let s = () => {
			if (e.isMounted) {
				let { next: t, bu: n, u: r, parent: s, vnode: c } = e;
				{
					let n = Ga(e);
					if (n) {
						t && (t.el = c.el, de(e, t, o)), n.asyncDep.then(() => {
							W(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				process.env.NODE_ENV !== "production" && _n(t || e.vnode), Va(e, !1), t ? (t.el = c.el, de(e, t, o)) : t = c, n && oe(n), (d = t.props && t.props.onVnodeBeforeUpdate) && bo(d, s, t, c), Va(e, !0), process.env.NODE_ENV !== "production" && Pa(e, "render");
				let f = Ji(e);
				process.env.NODE_ENV !== "production" && Fa(e, "render");
				let p = e.subTree;
				e.subTree = f, process.env.NODE_ENV !== "production" && Pa(e, "patch"), v(p, f, m(p.el), xe(p), e, i, a), process.env.NODE_ENV !== "production" && Fa(e, "patch"), t.el = f.el, u === null && ra(e, f.el), r && W(r, i), (d = t.props && t.props.onVnodeUpdated) && W(() => bo(d, s, t, c), i), process.env.NODE_ENV !== "production" && fr(e), process.env.NODE_ENV !== "production" && vn();
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Gr(t);
				if (Va(e, !1), l && oe(l), !m && (o = c && c.onVnodeBeforeMount) && bo(o, d, t), Va(e, !0), s && Ee) {
					let t = () => {
						process.env.NODE_ENV !== "production" && Pa(e, "render"), e.subTree = Ji(e), process.env.NODE_ENV !== "production" && Fa(e, "render"), process.env.NODE_ENV !== "production" && Pa(e, "hydrate"), Ee(s, e.subTree, e, i, null), process.env.NODE_ENV !== "production" && Fa(e, "hydrate");
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0), process.env.NODE_ENV !== "production" && Pa(e, "render");
					let o = e.subTree = Ji(e);
					process.env.NODE_ENV !== "production" && Fa(e, "render"), process.env.NODE_ENV !== "production" && Pa(e, "patch"), v(null, o, n, r, e, i, a), process.env.NODE_ENV !== "production" && Fa(e, "patch"), t.el = o.el;
				}
				if (u && W(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					W(() => bo(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Gr(d.vnode) && d.vnode.shapeFlag & 256) && e.a && W(e.a, i), e.isMounted = !0, process.env.NODE_ENV !== "production" && dr(e), t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new Le(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => zn(u), Va(e, !0), process.env.NODE_ENV !== "production" && (c.onTrack = e.rtc ? (t) => oe(e.rtc, t) : void 0, c.onTrigger = e.rtg ? (t) => oe(e.rtg, t) : void 0), l();
	}, de = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, la(e, t.props, r, n), ja(e, t.children, n), Qe(), Hn(e), $e();
	}, fe = (e, t, n, r, i, a, o, s, c = !1) => {
		let l = e && e.children, u = e ? e.shapeFlag : 0, d = t.children, { patchFlag: f, shapeFlag: m } = t;
		if (f > 0) {
			if (f & 128) {
				me(l, d, n, r, i, a, o, s, c);
				return;
			}
			if (f & 256) {
				pe(l, d, n, r, i, a, o, s, c);
				return;
			}
		}
		m & 8 ? (u & 16 && be(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? me(l, d, n, r, i, a, o, s, c) : be(l, i, a, !0) : (u & 8 && p(n, ""), m & 16 && E(d, n, r, i, a, o, s, c));
	}, pe = (e, t, r, i, a, o, s, c, l) => {
		e ||= n, t ||= n;
		let u = e.length, d = t.length, f = Math.min(u, d), p = 0;
		for (; p < f; p++) {
			let n = t[p] = l ? _o(t[p]) : Q(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? be(e, a, o, !0, !1, f) : E(t, r, i, a, o, s, c, l, f);
	}, me = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? _o(t[u]) : Q(t[u]);
			if (ao(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? _o(t[p]) : Q(t[p]);
			if (ao(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? _o(t[u]) : Q(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) ge(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? _o(t[u]) : Q(t[u]);
				e.key != null && (process.env.NODE_ENV !== "production" && g.has(e.key) && z("Duplicate keys found during update:", JSON.stringify(e.key), "Make sure keys are unique."), g.set(e.key, u));
			}
			let _, y = 0, b = p - h + 1, x = !1, S = 0, C = Array(b);
			for (u = 0; u < b; u++) C[u] = 0;
			for (u = m; u <= f; u++) {
				let n = e[u];
				if (y >= b) {
					ge(n, a, o, !0);
					continue;
				}
				let i;
				if (n.key != null) i = g.get(n.key);
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && ao(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? ge(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? Wa(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || qa(f) : i;
				C[u] === 0 ? v(null, n, r, p, a, o, s, c, l) : x && (_ < 0 || u !== w[_] ? he(n, r, p, 2) : _--);
			}
		}
	}, he = (e, t, n, r, i = null) => {
		let { el: a, type: c, transition: l, children: u, shapeFlag: d } = e;
		if (d & 6) {
			he(e.component.subTree, t, n, r);
			return;
		}
		if (d & 128) {
			e.suspense.move(t, n, r);
			return;
		}
		if (d & 64) {
			c.move(e, t, n, we);
			return;
		}
		if (c === G) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) he(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === Za) {
			C(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[Fr] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), W(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[Fr];
					a._isLeaving && a[Fr](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, ge = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if ((d === -2 || l && l.hasOnce) && (i = !1), s != null && (Qe(), Ur(s, null, n, e, !0), $e()), p != null && (!e.ctx || e.ctx === t) && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Gr(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && bo(_, t, e), u & 6) ye(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && wr(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, we, r) : l && !l.hasOnce && (a !== G || d > 0 && d & 64) ? be(l, t, n, !1, !0) : (a === G && d & 384 || !i && u & 16) && be(c, t, n), r && _e(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && W(() => {
			_ && bo(_, t, e), h && wr(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, _e = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === G) {
			process.env.NODE_ENV !== "production" && e.patchFlag > 0 && e.patchFlag & 2048 && i && !i.persisted ? e.children.forEach((e) => {
				e.type === K ? s(e.el) : _e(e);
			}) : ve(n, r);
			return;
		}
		if (t === Za) {
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
	}, ve = (e, t) => {
		let n;
		for (; e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, ye = (e, t, n) => {
		process.env.NODE_ENV !== "production" && e.type.__hmrId && Zn(e);
		let { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e;
		Ka(c), Ka(l), r && oe(r), i.stop(), a ? (a.flags |= 8, ge(o, e, t, n)) : e.vnode.el && o && (o.transition = e.vnode.transition, ge(o, e, t, n)), s && W(s, t), W(() => {
			e.isUnmounted = !0;
		}, t), process.env.NODE_ENV !== "production" && mr(e);
	}, be = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) ge(e[o], t, n, r, i);
	}, xe = (e) => {
		if (e.shapeFlag & 6) return xe(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[Nr];
		return n ? h(n) : t;
	}, Se = !1, Ce = (e, t, n) => {
		let r;
		e == null ? t._vnode && (ge(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, Se ||= (Se = !0, Hn(r), Un(), !1);
	}, we = {
		p: v,
		um: ge,
		m: he,
		r: _e,
		mt: k,
		mc: E,
		pc: fe,
		pbc: D,
		n: xe,
		o: e
	}, Te, Ee;
	return i && ([Te, Ee] = i(we)), {
		render: Ce,
		hydrate: Te,
		createApp: zi(Ce, Te)
	};
}
function Ba({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function Va({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function Ha(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function Ua(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = _o(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && Ua(t, a)), a.type === Xa && (a.patchFlag === -1 && (a = i[e] = _o(a)), a.el = t.el), a.type === K && !a.el && (a.el = t.el), process.env.NODE_ENV !== "production" && a.el && (a.el.__vnode = a);
	}
}
function Wa(e) {
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
function Ga(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : Ga(t);
}
function Ka(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function qa(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? qa(t.subTree) : null;
}
var Ja = (e) => e.__isSuspense;
function Ya(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : Vn(e);
}
var G = /* @__PURE__ */ Symbol.for("v-fgt"), Xa = /* @__PURE__ */ Symbol.for("v-txt"), K = /* @__PURE__ */ Symbol.for("v-cmt"), Za = /* @__PURE__ */ Symbol.for("v-stc"), Qa = [], q = null;
function J(e = !1) {
	Qa.push(q = e ? null : []);
}
function $a() {
	Qa.pop(), q = Qa[Qa.length - 1] || null;
}
var eo = 1;
function to(e, t = !1) {
	eo += e, e < 0 && q && t && (q.hasOnce = !0);
}
function no(e) {
	return e.dynamicChildren = eo > 0 ? q || n : null, $a(), eo > 0 && q && q.push(e), e;
}
function Y(e, t, n, r, i, a) {
	return no(X(e, t, n, r, i, a, !0));
}
function ro(e, t, n, r, i) {
	return no(Z(e, t, n, r, i, !0));
}
function io(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function ao(e, t) {
	if (process.env.NODE_ENV !== "production" && t.shapeFlag & 6 && e.component) {
		let n = Jn.get(t.type);
		if (n && n.has(e.component)) return e.shapeFlag &= -257, t.shapeFlag &= -513, !1;
	}
	return e.type === t.type && e.key === t.key;
}
var oo = (...e) => uo(...e), so = ({ key: e }) => e ?? null, co = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ R(e) || h(e) ? {
	i: H,
	r: e,
	k: t,
	f: !!n
} : e);
function X(e, t = null, n = null, r = 0, i = null, a = e === G ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && so(t),
		ref: t && co(t),
		scopeId: br,
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
		ctx: H
	};
	if (s ? (vo(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), process.env.NODE_ENV !== "production" && c.key !== c.key && z("VNode created with invalid key (NaN). VNode type:", c.type), process.env.NODE_ENV !== "production" && t && c.shapeFlag & 1) {
		let e = t.innerHTML == null ? t.textContent == null ? null : "textContent" : "innerHTML";
		e && lo(c.children) && z(`The \`${e}\` prop on <${c.type}> will override its children. Remove either the \`${e}\` prop or the children.`);
	}
	return eo > 0 && !o && q && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && q.push(c), c;
}
function lo(e) {
	return g(e) ? e !== "" : d(e) ? e.length > 0 : !1;
}
var Z = process.env.NODE_ENV === "production" ? uo : oo;
function uo(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === li) && (process.env.NODE_ENV !== "production" && !e && z(`Invalid vnode type when creating vnode: ${e}.`), e = K), io(e)) {
		let r = po(e, t, !0);
		return n && vo(r, n), eo > 0 && !a && q && (r.shapeFlag & 6 ? q[q.indexOf(e)] = r : q.push(r)), r.patchFlag = -2, r;
	}
	if (Ko(e) && (e = e.__vccOpts), t) {
		t = fo(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = he(e)), v(n) && (/* @__PURE__ */ Qt(n) && !d(n) && (n = s({}, n)), t.style = ue(n));
	}
	let o = g(e) ? 1 : Ja(e) ? 128 : Pr(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return process.env.NODE_ENV !== "production" && o & 4 && /* @__PURE__ */ Qt(e) && (e = /* @__PURE__ */ I(e), z("Vue received a Component that was made a reactive object. This can lead to unnecessary performance overhead and should be avoided by marking the component with `markRaw` or using `shallowRef` instead of `ref`.", "\nComponent that was made reactive: ", e)), X(e, t, n, r, i, o, a, !0);
}
function fo(e) {
	return e ? /* @__PURE__ */ Qt(e) || oa(e) ? s({}, e) : e : null;
}
function po(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? yo(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && so(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(co(t)) : [a, co(t)] : co(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: process.env.NODE_ENV !== "production" && o === -1 && d(s) ? s.map(mo) : s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== G ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && po(e.ssContent),
		ssFallback: e.ssFallback && po(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce,
		cacheIndex: e.cacheIndex
	};
	return c && r && Rr(u, c.clone(u)), u;
}
function mo(e) {
	let t = po(e);
	return d(e.children) && (t.children = e.children.map(mo)), t;
}
function ho(e = " ", t = 0) {
	return Z(Xa, null, e, t);
}
function go(e = "", t = !1) {
	return t ? (J(), ro(K, null, e)) : Z(K, null, e);
}
function Q(e) {
	return e == null || typeof e == "boolean" ? Z(K) : d(e) ? Z(G, null, e.slice()) : io(e) ? _o(e) : Z(Xa, null, String(e));
}
function _o(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : po(e);
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
			!r && !oa(t) ? t._ctx = H : r === 3 && H && (H.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			vo(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: H
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [ho(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function yo(...e) {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		for (let e in r) if (e === "class") t.class !== r.class && (t.class = he([t.class, r.class]));
		else if (e === "style") t.style = ue([t.style, r.style]);
		else if (a(e)) {
			let n = t[e], i = r[e];
			i && n !== i && !(d(n) && n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !o(e) && (t[e] = i);
		} else e !== "" && (t[e] = r[e]);
	}
	return t;
}
function bo(e, t, n, r = null) {
	Dn(e, t, 7, [n, r]);
}
var xo = Li(), So = 0;
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
		scope: new Pe(!0),
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
		propsOptions: pa(i, a),
		emitsOptions: Wi(i, a),
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
	return o.ctx = process.env.NODE_ENV === "production" ? { _: o } : vi(o), o.root = n ? n.root : o, o.emit = Hi.bind(null, o), e.ce && e.ce(o), o;
}
var $ = null, wo = () => $ || H, To, Eo;
{
	let e = le(), t = (t, n) => {
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
	(ko(e) || t(e)) && z("Do not use built-in or reserved HTML elements as component id: " + e);
}
function jo(e) {
	return e.vnode.shapeFlag & 4;
}
var Mo = !1;
function No(e, t = !1, n = !1) {
	t && Eo(t);
	let { props: r, children: i } = e.vnode, a = jo(e);
	sa(e, r, a, t), Aa(e, i, n || t);
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
			for (let t = 0; t < e.length; t++) Cr(e[t]);
		}
		n.compilerOptions && Io() && z("\"compilerOptions\" is only supported when using a build of Vue that includes the runtime compiler. Since you are using a runtime-only build, the options should be passed via your build tool config instead.");
	}
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, _i), process.env.NODE_ENV !== "production" && yi(e);
	let { setup: r } = n;
	if (r) {
		Qe();
		let i = e.setupContext = r.length > 1 ? Bo(e) : null, a = Do(e), o = En(r, e, 0, [process.env.NODE_ENV === "production" ? e.props : /* @__PURE__ */ Yt(e.props), i]), s = y(o);
		if ($e(), a(), (s || e.sp) && !Gr(e) && zr(e), s) {
			if (o.then(Oo, Oo), t) return o.then((n) => {
				Eo(!0);
				try {
					Fo(e, n, t);
				} finally {
					Eo(!1);
				}
			}).catch((t) => {
				On(t, e, 0);
			});
			e.asyncDep = o, process.env.NODE_ENV !== "production" && !e.suspense && z(`Component <${Go(e, n)}>: setup function returned a promise, but no <Suspense> boundary was found in the parent component tree. A component with async setup() must be nested in a <Suspense> in order to be rendered.`);
		} else Fo(e, o, t);
	} else Lo(e, t);
}
function Fo(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) ? (process.env.NODE_ENV !== "production" && io(t) && z("setup() should not return VNodes directly - return a render function instead."), process.env.NODE_ENV !== "production" && (e.devtoolsRawSetupState = t), e.setupState = sn(t), process.env.NODE_ENV !== "production" && bi(e)) : process.env.NODE_ENV !== "production" && t !== void 0 && z(`setup() should return an object. Received: ${t === null ? "null" : typeof t}`), Lo(e, n);
}
var Io = () => !0;
function Lo(e, t, n) {
	let i = e.type;
	e.render ||= i.render || r;
	{
		let t = Do(e);
		Qe();
		try {
			wi(e);
		} finally {
			$e(), t();
		}
	}
	process.env.NODE_ENV !== "production" && !i.render && e.render === r && !t && (i.template ? z("Component provided template option but runtime compilation is not supported in this build of Vue. Configure your bundler to alias \"vue\" to \"vue/dist/vue.esm-bundler.js\".") : z("Component is missing template or render function: ", i));
}
var Ro = process.env.NODE_ENV === "production" ? { get(e, t) {
	return N(e, "get", ""), e[t];
} } : {
	get(e, t) {
		return qi(), N(e, "get", ""), e[t];
	},
	set() {
		return z("setupContext.attrs is readonly."), !1;
	},
	deleteProperty() {
		return z("setupContext.attrs is readonly."), !1;
	}
};
function zo(e) {
	return new Proxy(e.slots, { get(t, n) {
		return N(e, "get", "$slots"), t[n];
	} });
}
function Bo(e) {
	let t = (t) => {
		if (process.env.NODE_ENV !== "production" && (e.exposed && z("expose() should be called only once per setup()."), t != null)) {
			let e = typeof t;
			e === "object" && (d(t) ? e = "array" : /* @__PURE__ */ R(t) && (e = "ref")), e !== "object" && z(`expose() should be passed a plain object, received ${e}.`);
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
	return e.exposed ? e.exposeProxy ||= new Proxy(sn($t(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in mi) return mi[n](e);
		},
		has(e, t) {
			return t in e || t in mi;
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
	let n = /* @__PURE__ */ ln(e, t, Mo);
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
			if (/* @__PURE__ */ R(t)) {
				Qe();
				let n = t.value;
				return $e(), [
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
			return /* @__PURE__ */ Zt(t) ? [
				"div",
				{},
				[
					"span",
					e,
					/* @__PURE__ */ F(t) ? "ShallowReactive" : "Reactive"
				],
				"<",
				l(t),
				`>${/* @__PURE__ */ P(t) ? " (readonly)" : ""}`
			] : /* @__PURE__ */ P(t) ? [
				"div",
				{},
				[
					"span",
					e,
					/* @__PURE__ */ F(t) ? "ShallowReadonly" : "Readonly"
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
		e.type.props && e.props && n.push(c("props", /* @__PURE__ */ I(e.props))), e.setupState !== t && n.push(c("setup", e.setupState)), e.data !== t && n.push(c("data", /* @__PURE__ */ I(e.data)));
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
		] : v(e) ? ["object", { object: t ? /* @__PURE__ */ I(e) : e }] : [
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
		return /* @__PURE__ */ F(e) ? "ShallowRef" : e.effect ? "ComputedRef" : "Ref";
	}
	window.devtoolsFormatters ? window.devtoolsFormatters.push(a) : window.devtoolsFormatters = [a];
}
var Yo = "3.5.43", Xo = process.env.NODE_ENV === "production" ? r : z;
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
		ps.test(n) ? e.setProperty(D(r), n.replace(ps, ""), "important") : e[r] = n;
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
	let r = E(t);
	if (r !== "filter" && r in e) return gs[t] = r;
	r = ie(r);
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
function bs(e, t, n, r, i, a = Ce(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(ys, t.slice(6, t.length)) : e.setAttributeNS(ys, t, n) : n == null || a && !we(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
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
		r === "boolean" ? n = we(n) : n == null && r === "string" ? (n = "", o = !0) : r === "number" && (n = 0, o = !0);
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
	return [e[2] === ":" ? e.slice(3) : D(e.slice(2)), t];
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
				e && Dn(e, t, 5, a);
			}
		} else Dn(r, t, 5, [e]);
	};
	return n.value = e, n.attached = js(), n;
}
function Ns(e, t) {
	return h(e) || d(e) ? e : (Xo(`Wrong type passed as event handler to ${t} - did you forget @ or : in front of your prop?
Expected function or array of functions, received type ${typeof e}.`), r);
}
var Ps = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Fs = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? os(e, r, c) : t === "style" ? ds(e, n, r) : a(t) ? o(t) || Ts(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), 1) : t[0] === "^" ? (t = t.slice(1), 0) : Is(e, t, r, c)) ? (xs(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && bs(e, t, r, c, s, t !== "value")) : e._isVueCE && (Ls(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? xs(e, E(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), bs(e, t, r, c));
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
	let r = E(t);
	return Array.isArray(n) ? n.some((e) => E(e) === r) : Object.keys(n).some((e) => E(e) === r);
}
var Rs = /* @__PURE__ */ s({ patchProp: Fs }, is), zs;
function Bs() {
	return zs ||= Ra(Rs);
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
		value: (e) => ye(e) || be(e) || xe(e),
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
		return (t, n) => (J(), Y("section", qs, [
			n[2] ||= X("h3", { class: "ws-title" }, "手动触发 ingest", -1),
			n[3] ||= X("p", { class: "ws-note" }, [
				ho(" 双动作：「扫描增量」只跑机械面（ingest-pipeline.py scan，只读）；「触发蒸馏」呼叫 headless 任务通道（dsh-cron wiki-ingest），"),
				X("strong", null, "蒸馏由任务执行"),
				ho("（本面板不做 LLM 蒸馏）。 ")
			], -1),
			X("div", Js, [X("button", {
				class: "ws-btn",
				type: "button",
				disabled: a.value,
				onClick: n[0] ||= (e) => r("scan")
			}, "扫描增量", 8, Ys), i.value ? (J(), Y("button", {
				key: 0,
				class: "ws-btn ws-btn-primary",
				type: "button",
				disabled: o.value,
				onClick: n[1] ||= (e) => r("distill")
			}, "触发蒸馏", 8, Xs)) : go("", !0)]),
			e.channel && !i.value ? (J(), Y("p", Zs, " 蒸馏通道不可用：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill。 ")) : go("", !0),
			e.state.scan.message ? (J(), Y("p", Qs, A(e.state.scan.message), 1)) : go("", !0),
			e.state.distill.message ? (J(), Y("p", $s, A(e.state.distill.message), 1)) : go("", !0)
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
		return (t, n) => (J(), Y("section", ac, [
			X("h3", oc, [n[2] ||= ho(" ingest 日志 ", -1), X("button", {
				class: "ws-btn ws-btn-ghost",
				type: "button",
				onClick: n[0] ||= (e) => r("reload")
			}, "刷新")]),
			X("p", sc, [n[3] ||= ho(" 来源拼接（无统一日志文件）： ", -1), (J(!0), Y(G, null, ui(e.meta.sources, (e) => (J(), Y("span", {
				key: e.id,
				class: "ws-src"
			}, A(e.label), 1))), 128))]),
			e.error ? (J(), Y("p", cc, A(e.error), 1)) : go("", !0),
			e.meta.stale ? (J(), Y("p", lc, "游标失效（日志已轮转/更新）——已回到最新视图。")) : go("", !0),
			X("div", uc, [(J(!0), Y(G, null, ui(i.value, (e) => (J(), Y(G, { key: e.source + e.lines[0]?.name + e.lines[0]?.line }, [X("div", dc, A(e.label), 1), (J(!0), Y(G, null, ui(e.lines, (e) => (J(), Y("div", {
				key: `${e.source}|${e.name}|${e.line}`,
				class: "ws-log-line",
				title: `${e.name}:${e.line}`
			}, [
				X("span", pc, A(an(ic)(e.source)), 1),
				X("span", mc, A(e.text), 1),
				e.truncated ? (J(), Y("span", hc, "截断")) : go("", !0)
			], 8, fc))), 128))], 64))), 128)), e.lines.length === 0 && !e.error ? (J(), Y("div", gc, "暂无日志（各来源均无记录）。")) : go("", !0)]),
			X("div", _c, [e.meta.hasMore ? (J(), Y("button", {
				key: 0,
				class: "ws-btn",
				type: "button",
				onClick: n[1] ||= (e) => r("load-older")
			}, "加载更早")) : go("", !0)])
		]));
	}
};
//#endregion
//#region web/src/lib/log-history.js
function yc() {
	return {
		lines: [],
		meta: {
			hasMore: !1,
			cursor: null,
			sources: [],
			stale: !1
		},
		error: ""
	};
}
function bc(e, t) {
	return {
		lines: Array.isArray(t.lines) ? t.lines : [],
		meta: {
			hasMore: t.hasMore === !0,
			cursor: t.cursor ?? null,
			sources: Array.isArray(t.sources) ? t.sources : [],
			stale: t.stale === !0
		},
		error: ""
	};
}
function xc(e, t) {
	return {
		lines: rc(e.lines, Array.isArray(t.lines) ? t.lines : []),
		meta: {
			hasMore: t.hasMore === !0,
			cursor: t.cursor ?? null,
			sources: e.meta.sources,
			stale: t.stale === !0
		},
		error: ""
	};
}
function Sc(e, t) {
	return {
		lines: e.lines,
		meta: e.meta,
		error: String(t && t.message || t)
	};
}
function Cc(e) {
	return e.meta.hasMore === !0;
}
//#endregion
//#region web/src/components/LogHistoryView.vue
var wc = {
	__name: "LogHistoryView",
	props: { api: {
		type: Object,
		required: !0
	} },
	setup(e, { expose: t }) {
		let n = e, r = /* @__PURE__ */ tn(yc());
		async function i() {
			try {
				r.value = bc(r.value, await n.api.fetchLogs(200));
			} catch (e) {
				r.value = Sc(r.value, e);
			}
		}
		async function a() {
			if (Cc(r.value)) try {
				r.value = xc(r.value, await n.api.fetchLogs(200, r.value.meta.cursor));
			} catch (e) {
				r.value = Sc(r.value, e);
			}
		}
		return ei(i), t({ reload: i }), (e, t) => (J(), ro(vc, {
			lines: r.value.lines,
			meta: r.value.meta,
			error: r.value.error,
			onLoadOlder: a,
			onReload: i
		}, null, 8, [
			"lines",
			"meta",
			"error"
		]));
	}
};
//#endregion
//#region web/src/lib/settings-model.js
function Tc(e) {
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
var Ec = {
	class: "ws-block",
	"aria-label": "相关设置"
}, Dc = {
	key: 0,
	class: "ws-error"
}, Oc = {
	key: 1,
	class: "ws-note"
}, kc = { class: "ws-subtitle" }, Ac = { class: "ws-rows" }, jc = { class: "ws-row-key" }, Mc = { class: "ws-row-val" }, Nc = { class: "ws-row-value" }, Pc = { class: "ws-row-note" }, Fc = {
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
		let t = e, n = qo(() => t.settings === null ? [] : Tc(t.settings));
		return (t, r) => (J(), Y("section", Ec, [
			r[0] ||= X("h3", { class: "ws-title" }, "相关设置（只读展示）", -1),
			e.error ? (J(), Y("p", Dc, A(e.error), 1)) : go("", !0),
			e.settings === null && !e.error ? (J(), Y("p", Oc, "设置加载中…")) : go("", !0),
			(J(!0), Y(G, null, ui(n.value, (e) => (J(), Y(G, { key: e.title }, [X("h4", kc, A(e.title), 1), X("dl", Ac, [(J(!0), Y(G, null, ui(e.rows, (e) => (J(), Y(G, { key: e.key }, [X("dt", jc, A(e.key), 1), X("dd", Mc, [X("span", Nc, A(e.value), 1), X("span", Pc, A(e.note), 1)])], 64))), 128))])], 64))), 128))
		]));
	}
};
//#endregion
//#region web/src/lib/trigger-model.js
function Ic() {
	return {
		status: "idle",
		message: "",
		logFile: null,
		result: null
	};
}
function Lc() {
	return {
		scan: Ic(),
		distill: Ic()
	};
}
function Rc(e, t) {
	return {
		...e,
		[t]: {
			...e[t],
			status: "running",
			message: "执行中…"
		}
	};
}
function zc(e) {
	let t = e.summary ?? {};
	if (!e.ok) return `扫描失败（exit ${e.exitCode}）：${String(e.output ?? "").split("\n")[0] || "无输出"}`;
	if (t.unknown === !0) return "扫描完成（输出未能机械解析，原文见日志）";
	if ((t.pending ?? 0) === 0) return "扫描完成：无待编译素材";
	let n = (t.pendingFiles ?? []).filter((e) => e.status === "ingest").length, r = (t.pendingFiles ?? []).filter((e) => e.status === "re_ingest").length;
	return `扫描完成：待编译 ${t.pending} 条（新增 ${n} / 更新 ${r}），增量清单见日志`;
}
function Bc(e) {
	return String(e.note ?? "");
}
function Vc(e, t, n) {
	if (t === "scan") return {
		...e,
		scan: {
			status: n.ok ? "done" : "error",
			message: zc(n),
			logFile: n.logFile ?? null,
			result: n
		}
	};
	let r = n.started === !0 ? "done" : n.reason === "spawn-failed" ? "error" : "skipped";
	return {
		...e,
		distill: {
			status: r,
			message: Bc(n),
			logFile: n.logFile ?? null,
			result: n
		}
	};
}
//#endregion
//#region web/src/App.vue
var Hc = { class: "ws-root" }, Uc = {
	__name: "App",
	props: { api: {
		type: Object,
		required: !0
	} },
	setup(e) {
		let t = e, n = /* @__PURE__ */ tn(null), r = /* @__PURE__ */ tn(""), i = /* @__PURE__ */ tn(Lc()), a = /* @__PURE__ */ tn(null);
		async function o() {
			try {
				n.value = await t.api.fetchSettings(), r.value = "";
			} catch (e) {
				r.value = String(e?.message ?? e);
			}
		}
		async function s() {
			i.value = Rc(i.value, "scan");
			try {
				let e = await t.api.scan();
				i.value = Vc(i.value, "scan", e), await a.value?.reload();
			} catch (e) {
				i.value = Vc(i.value, "scan", {
					ok: !1,
					exitCode: null,
					summary: {},
					output: String(e?.message ?? e),
					logFile: null
				});
			}
		}
		async function c() {
			i.value = Rc(i.value, "distill");
			try {
				let e = await t.api.distill();
				i.value = Vc(i.value, "distill", e);
			} catch (e) {
				i.value = Vc(i.value, "distill", {
					started: !1,
					reason: "request-failed",
					note: `触发失败：${String(e?.message ?? e)}`,
					logFile: null
				});
			}
		}
		return ei(o), (e, o) => (J(), Y("div", Hc, [
			Z(ec, {
				state: i.value,
				channel: n.value?.channel ?? null,
				onScan: s,
				onDistill: c
			}, null, 8, ["state", "channel"]),
			Z(wc, {
				ref_key: "logView",
				ref: a,
				api: t.api
			}, null, 8, ["api"]),
			Z(Fc, {
				settings: n.value,
				error: r.value
			}, null, 8, ["settings", "error"])
		]));
	}
};
//#endregion
//#region web/src/api.js
async function Wc(e, t = {}) {
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
function Gc(e) {
	return {
		fetchSettings: () => Wc(`${e}/ingest/settings`),
		fetchLogs: (t, n) => {
			let r = new URLSearchParams();
			t != null && r.set("limit", String(t)), n != null && r.set("cursor", String(n));
			let i = r.toString();
			return Wc(`${e}/ingest/logs${i === "" ? "" : `?${i}`}`);
		},
		scan: () => Wc(`${e}/ingest/scan`, { method: "POST" }),
		distill: () => Wc(`${e}/ingest/distill`, { method: "POST" })
	};
}
//#endregion
//#region web/src/lib/view-model.js
function Kc(e) {
	return e === "log" ? "log" : "full";
}
//#endregion
//#region web/src/panel.js
var qc = "data-wiki-steward-panel-style";
function Jc(e) {
	if (e.querySelector(`link[${qc}]`)) return;
	let t = e.createElement("link");
	t.rel = "stylesheet", t.href = new URL("./style.css", "" + import.meta.url).href, t.setAttribute(qc, ""), e.head.appendChild(t);
}
function Yc(e, t = {}) {
	Jc(e.ownerDocument ?? document);
	let n = Gc(t.apiBase ?? "/wiki-steward/api"), r = Vs(Kc(t.view) === "log" ? wc : Uc, { api: n });
	return r.mount(e), { unmount() {
		try {
			r.unmount();
		} catch {}
		try {
			e.textContent = "";
		} catch {}
	} };
}
//#endregion
export { Yc as mount };
