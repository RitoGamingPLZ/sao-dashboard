import { createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, renderSlot as _renderSlot, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, createTextVNode as _createTextVNode, normalizeStyle as _normalizeStyle, normalizeClass as _normalizeClass, renderList as _renderList, Fragment as _Fragment } from "./vue.esm-browser.prod.js"

const _hoisted_1 = { class: "row-head" }
const _hoisted_2 = ["data-state", "title"]
const _hoisted_3 = { class: "row-lv" }
const _hoisted_4 = ["onClick"]
const _hoisted_5 = /*#__PURE__*/_createElementVNode("span", { class: "row-rule" }, null, -1 /* HOISTED */)
const _hoisted_6 = { class: "row-status" }
const _hoisted_7 = {
  key: 0,
  class: "cell-sub"
}
const _hoisted_8 = ["title"]
const _hoisted_9 = { class: "row-bars" }
const _hoisted_10 = { class: "row-bar" }
const _hoisted_11 = { class: "row-bar-track" }
const _hoisted_12 = /*#__PURE__*/_createElementVNode("b", null, "HP", -1 /* HOISTED */)
const _hoisted_13 = { class: "cell-sub" }
const _hoisted_14 = { class: "row-bar" }
const _hoisted_15 = { class: "row-bar-track" }
const _hoisted_16 = /*#__PURE__*/_createElementVNode("b", null, "EXP", -1 /* HOISTED */)
const _hoisted_17 = { class: "sb-track mini sb-exp" }
const _hoisted_18 = { class: "cell-sub" }
const _hoisted_19 = { class: "row-stats" }
const _hoisted_20 = { class: "field" }
const _hoisted_21 = /*#__PURE__*/_createElementVNode("b", null, "ATK", -1 /* HOISTED */)
const _hoisted_22 = { class: "field" }
const _hoisted_23 = /*#__PURE__*/_createElementVNode("b", null, "摳", -1 /* HOISTED */)
const _hoisted_24 = { class: "field" }
const _hoisted_25 = /*#__PURE__*/_createElementVNode("b", null, "EXP/m", -1 /* HOISTED */)
const _hoisted_26 = { class: "row-bottom" }
const _hoisted_27 = { class: "row-alerts" }
const _hoisted_28 = { class: "row-actions" }
const _hoisted_29 = ["disabled", "onClick"]
const _hoisted_30 = ["disabled", "onClick"]
const _hoisted_31 = ["disabled", "onClick"]

export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock("div", {
    class: _normalizeClass(["char-row", { dead: _ctx.account.player?.isDead }])
  }, [
    _createElementVNode("div", _hoisted_1, [
      _createElementVNode("span", {
        class: "status-dot",
        "data-state": _ctx.statusDotState,
        title: _ctx.statusDotState
      }, null, 8 /* PROPS */, _hoisted_2),
      _createElementVNode("span", _hoisted_3, "Lv " + _toDisplayString(_ctx.account.player?.level ?? '—'), 1 /* TEXT */),
      _createElementVNode("button", {
        class: "link-name",
        onClick: $event => (_ctx.$emit('open-profile', _ctx.account.id))
      }, _toDisplayString(_ctx.account.name), 9 /* TEXT, PROPS */, _hoisted_4),
      _renderSlot(_ctx.$slots, "leading"),
      _hoisted_5,
      _createElementVNode("span", _hoisted_6, [
        _createTextVNode(_toDisplayString(_ctx.doingLabel(_ctx.account)), 1 /* TEXT */),
        (_ctx.account.busyLabel)
          ? (_openBlock(), _createElementBlock("span", _hoisted_7, " · " + _toDisplayString(_ctx.account.busyLabel), 1 /* TEXT */))
          : _createCommentVNode("v-if", true)
      ]),
      _createElementVNode("span", {
        class: "row-location",
        title: _ctx.account.player?.areaId || ''
      }, _toDisplayString(_ctx.account.player?.areaId || '—'), 9 /* TEXT, PROPS */, _hoisted_8)
    ]),
    _createElementVNode("div", _hoisted_9, [
      _createElementVNode("div", _hoisted_10, [
        _createElementVNode("div", _hoisted_11, [
          _hoisted_12,
          _createElementVNode("span", {
            class: _normalizeClass(["sb-track mini", _ctx.hpBarClass])
          }, [
            _createElementVNode("i", {
              style: _normalizeStyle(_ctx.hpFillStyle)
            }, null, 4 /* STYLE */)
          ], 2 /* CLASS */)
        ]),
        _createElementVNode("span", _hoisted_13, _toDisplayString(_ctx.account.player ? _ctx.fmt(_ctx.account.player.hp) + ' / ' + _ctx.fmt(_ctx.account.player.maxHp) : '—'), 1 /* TEXT */)
      ]),
      _createElementVNode("div", _hoisted_14, [
        _createElementVNode("div", _hoisted_15, [
          _hoisted_16,
          _createElementVNode("span", _hoisted_17, [
            _createElementVNode("i", {
              style: _normalizeStyle(_ctx.expFillStyle)
            }, null, 4 /* STYLE */)
          ])
        ]),
        _createElementVNode("span", _hoisted_18, _toDisplayString(_ctx.account.player?.expPct != null ? _ctx.account.player.expPct + '%' : _ctx.fmt(_ctx.account.player?.exp)), 1 /* TEXT */)
      ])
    ]),
    _createElementVNode("div", _hoisted_19, [
      _createElementVNode("span", _hoisted_20, [
        _hoisted_21,
        _createTextVNode(" " + _toDisplayString(_ctx.fmt(_ctx.account.player?.attack)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_22, [
        _hoisted_23,
        _createTextVNode(" " + _toDisplayString(_ctx.fmtCompact(_ctx.account.player?.gold)), 1 /* TEXT */)
      ]),
      _createElementVNode("span", _hoisted_24, [
        _hoisted_25,
        _createTextVNode(" " + _toDisplayString(_ctx.fmt(_ctx.account.rates?.expPerMin)), 1 /* TEXT */)
      ])
    ]),
    _createElementVNode("div", _hoisted_26, [
      _createElementVNode("div", _hoisted_27, [
        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.account.alerts, (text) => {
          return (_openBlock(), _createElementBlock("p", {
            key: text,
            class: "alert"
          }, _toDisplayString(text), 1 /* TEXT */))
        }), 128 /* KEYED_FRAGMENT */))
      ]),
      _createElementVNode("div", _hoisted_28, [
        (_ctx.showActions)
          ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
              _createElementVNode("button", {
                class: _normalizeClass(["button small", { primary: _ctx.mode === 'farm' }]),
                disabled: !_ctx.account.player,
                onClick: _ctx.toggleFarm
              }, _toDisplayString(_ctx.t('farm')), 11 /* TEXT, CLASS, PROPS */, _hoisted_29),
              _createElementVNode("button", {
                class: _normalizeClass(["button small", { primary: _ctx.mode === 'boss' }]),
                disabled: !_ctx.account.player,
                onClick: _ctx.toggleBoss
              }, _toDisplayString(_ctx.t('boss')), 11 /* TEXT, CLASS, PROPS */, _hoisted_30),
              _createElementVNode("button", {
                class: "button small",
                disabled: !_ctx.account.player,
                onClick: _ctx.doMission
              }, _toDisplayString(_ctx.t('mission')), 9 /* TEXT, PROPS */, _hoisted_31)
            ], 64 /* STABLE_FRAGMENT */))
          : _createCommentVNode("v-if", true),
        _renderSlot(_ctx.$slots, "trailing")
      ])
    ])
  ], 2 /* CLASS */))
}