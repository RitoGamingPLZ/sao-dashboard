import { renderSlot as _renderSlot, createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, createTextVNode as _createTextVNode, normalizeStyle as _normalizeStyle, normalizeClass as _normalizeClass, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, renderList as _renderList, Fragment as _Fragment } from "./vue.esm-browser.prod.js"

const _hoisted_1 = ["data-state", "title"]
const _hoisted_2 = ["onClick"]
const _hoisted_3 = { class: "field" }
const _hoisted_4 = /*#__PURE__*/_createElementVNode("b", null, "Lv", -1 /* HOISTED */)
const _hoisted_5 = { class: "field cell-hp" }
const _hoisted_6 = /*#__PURE__*/_createElementVNode("b", null, "HP", -1 /* HOISTED */)
const _hoisted_7 = { class: "cell-sub" }
const _hoisted_8 = { class: "field" }
const _hoisted_9 = /*#__PURE__*/_createElementVNode("b", null, "EXP", -1 /* HOISTED */)
const _hoisted_10 = { class: "field" }
const _hoisted_11 = /*#__PURE__*/_createElementVNode("b", null, "ATK", -1 /* HOISTED */)
const _hoisted_12 = ["title"]
const _hoisted_13 = /*#__PURE__*/_createElementVNode("b", null, "@", -1 /* HOISTED */)
const _hoisted_14 = { class: "field" }
const _hoisted_15 = {
  key: 0,
  class: "cell-sub"
}
const _hoisted_16 = { class: "field" }
const _hoisted_17 = /*#__PURE__*/_createElementVNode("b", null, "摳", -1 /* HOISTED */)
const _hoisted_18 = { class: "field" }
const _hoisted_19 = /*#__PURE__*/_createElementVNode("b", null, "EXP/m", -1 /* HOISTED */)
const _hoisted_20 = { class: "row-actions" }
const _hoisted_21 = ["disabled", "onClick"]
const _hoisted_22 = ["disabled", "onClick"]
const _hoisted_23 = ["disabled", "onClick"]
const _hoisted_24 = {
  key: 0,
  class: "alert-row"
}

export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock(_Fragment, null, [
    _createElementVNode("div", {
      class: _normalizeClass(["char-row", { dead: _ctx.account.player?.isDead }])
    }, [
      _renderSlot(_ctx.$slots, "leading"),
      _createElementVNode("span", {
        class: "status-dot",
        "data-state": _ctx.statusDotState,
        title: _ctx.statusDotState
      }, null, 8 /* PROPS */, _hoisted_1),
      _createElementVNode("button", {
        class: "link-name",
        onClick: $event => (_ctx.$emit('open-profile', _ctx.account.id))
      }, _toDisplayString(_ctx.account.name), 9 /* TEXT, PROPS */, _hoisted_2),
      _createElementVNode("span", _hoisted_3, [
        _hoisted_4,
        _createTextVNode(" " + _toDisplayString(_ctx.account.player?.level ?? '—'), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_5, [
        _hoisted_6,
        _createElementVNode("span", {
          class: _normalizeClass(["sb-track mini", _ctx.hpBarClass])
        }, [
          _createElementVNode("i", {
            style: _normalizeStyle(_ctx.hpFillStyle)
          }, null, 4 /* STYLE */)
        ], 2 /* CLASS */),
        _createElementVNode("span", _hoisted_7, _toDisplayString(_ctx.account.player?.hpPct != null ? _ctx.account.player.hpPct + '%' : '—'), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_8, [
        _hoisted_9,
        _createTextVNode(" " + _toDisplayString(_ctx.account.player?.expPct != null ? _ctx.account.player.expPct + '%' : _ctx.fmt(_ctx.account.player?.exp)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_10, [
        _hoisted_11,
        _createTextVNode(" " + _toDisplayString(_ctx.fmt(_ctx.account.player?.attack)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", {
        class: "field",
        title: _ctx.account.player?.areaId || ''
      }, [
        _hoisted_13,
        _createTextVNode(" " + _toDisplayString(_ctx.account.player?.areaId || '—'), 1 /* TEXT */)
      ], 8 /* PROPS */, _hoisted_12),
      _createElementVNode("span", _hoisted_14, [
        _createTextVNode(_toDisplayString(_ctx.doingLabel(_ctx.account)), 1 /* TEXT */),
        (_ctx.account.busyLabel)
          ? (_openBlock(), _createElementBlock("span", _hoisted_15, " · " + _toDisplayString(_ctx.account.busyLabel), 1 /* TEXT */))
          : _createCommentVNode("v-if", true)
      ]),
      _createElementVNode("span", _hoisted_16, [
        _hoisted_17,
        _createTextVNode(" " + _toDisplayString(_ctx.fmtCompact(_ctx.account.player?.gold)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_18, [
        _hoisted_19,
        _createTextVNode(" " + _toDisplayString(_ctx.fmt(_ctx.account.rates?.expPerMin)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_20, [
        _createElementVNode("button", {
          class: _normalizeClass(["button small", { primary: _ctx.mode === 'farm' }]),
          disabled: !_ctx.account.player,
          onClick: _ctx.toggleFarm
        }, _toDisplayString(_ctx.t('farm')), 11 /* TEXT, CLASS, PROPS */, _hoisted_21),
        _createElementVNode("button", {
          class: _normalizeClass(["button small", { primary: _ctx.mode === 'boss' }]),
          disabled: !_ctx.account.player,
          onClick: _ctx.toggleBoss
        }, _toDisplayString(_ctx.t('boss')), 11 /* TEXT, CLASS, PROPS */, _hoisted_22),
        _createElementVNode("button", {
          class: "button small",
          disabled: !_ctx.account.player,
          onClick: _ctx.doMission
        }, _toDisplayString(_ctx.t('mission')), 9 /* TEXT, PROPS */, _hoisted_23)
      ]),
      _renderSlot(_ctx.$slots, "trailing")
    ], 2 /* CLASS */),
    (_ctx.account.alerts.length)
      ? (_openBlock(), _createElementBlock("div", _hoisted_24, [
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.account.alerts, (text) => {
            return (_openBlock(), _createElementBlock("p", {
              key: text,
              class: "alert"
            }, _toDisplayString(text), 1 /* TEXT */))
          }), 128 /* KEYED_FRAGMENT */))
        ]))
      : _createCommentVNode("v-if", true)
  ], 64 /* STABLE_FRAGMENT */))
}