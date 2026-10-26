import { renderSlot as _renderSlot, createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, normalizeStyle as _normalizeStyle, normalizeClass as _normalizeClass, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, createTextVNode as _createTextVNode, renderList as _renderList, Fragment as _Fragment } from "./vue.esm-browser.prod.js"

const _hoisted_1 = ["data-state", "title"]
const _hoisted_2 = ["onClick"]
const _hoisted_3 = { class: "cell-hp" }
const _hoisted_4 = { class: "cell-sub" }
const _hoisted_5 = ["title"]
const _hoisted_6 = {
  key: 0,
  class: "cell-sub"
}
const _hoisted_7 = { class: "cell-actions" }
const _hoisted_8 = ["disabled", "onClick"]
const _hoisted_9 = ["disabled", "onClick"]
const _hoisted_10 = ["disabled", "onClick"]
const _hoisted_11 = {
  key: 0,
  class: "alert-row"
}
const _hoisted_12 = { colspan: 11 }

export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock(_Fragment, null, [
    _createElementVNode("tr", {
      class: _normalizeClass({ dead: _ctx.account.player?.isDead })
    }, [
      _renderSlot(_ctx.$slots, "leading"),
      _createElementVNode("td", null, [
        _createElementVNode("span", {
          class: "status-dot",
          "data-state": _ctx.statusDotState,
          title: _ctx.statusDotState
        }, null, 8 /* PROPS */, _hoisted_1)
      ]),
      _createElementVNode("td", null, [
        _createElementVNode("button", {
          class: "link-name",
          onClick: $event => (_ctx.$emit('open-profile', _ctx.account.id))
        }, _toDisplayString(_ctx.account.name), 9 /* TEXT, PROPS */, _hoisted_2)
      ]),
      _createElementVNode("td", null, _toDisplayString(_ctx.account.player?.level ?? '—'), 1 /* TEXT */),
      _createElementVNode("td", _hoisted_3, [
        _createElementVNode("span", {
          class: _normalizeClass(["sb-track mini", _ctx.hpBarClass])
        }, [
          _createElementVNode("i", {
            style: _normalizeStyle(_ctx.hpFillStyle)
          }, null, 4 /* STYLE */)
        ], 2 /* CLASS */),
        _createElementVNode("span", _hoisted_4, _toDisplayString(_ctx.account.player?.hpPct != null ? _ctx.account.player.hpPct + '%' : '—'), 1 /* TEXT */)
      ]),
      _createElementVNode("td", null, _toDisplayString(_ctx.account.player?.expPct != null ? _ctx.account.player.expPct + '%' : _ctx.fmt(_ctx.account.player?.exp)), 1 /* TEXT */),
      _createElementVNode("td", null, _toDisplayString(_ctx.fmt(_ctx.account.player?.attack)), 1 /* TEXT */),
      _createElementVNode("td", {
        title: _ctx.account.player?.areaId || ''
      }, _toDisplayString(_ctx.account.player?.areaId || '—'), 9 /* TEXT, PROPS */, _hoisted_5),
      _createElementVNode("td", null, [
        _createTextVNode(_toDisplayString(_ctx.doingLabel(_ctx.account)), 1 /* TEXT */),
        (_ctx.account.busyLabel)
          ? (_openBlock(), _createElementBlock("span", _hoisted_6, " · " + _toDisplayString(_ctx.account.busyLabel), 1 /* TEXT */))
          : _createCommentVNode("v-if", true)
      ]),
      _createElementVNode("td", null, _toDisplayString(_ctx.fmtCompact(_ctx.account.player?.gold)), 1 /* TEXT */),
      _createElementVNode("td", null, _toDisplayString(_ctx.fmt(_ctx.account.rates?.expPerMin)), 1 /* TEXT */),
      _createElementVNode("td", _hoisted_7, [
        _createElementVNode("button", {
          class: _normalizeClass(["button small", { primary: _ctx.mode === 'farm' }]),
          disabled: !_ctx.account.player,
          onClick: _ctx.toggleFarm
        }, _toDisplayString(_ctx.t('farm')), 11 /* TEXT, CLASS, PROPS */, _hoisted_8),
        _createElementVNode("button", {
          class: _normalizeClass(["button small", { primary: _ctx.mode === 'boss' }]),
          disabled: !_ctx.account.player,
          onClick: _ctx.toggleBoss
        }, _toDisplayString(_ctx.t('boss')), 11 /* TEXT, CLASS, PROPS */, _hoisted_9),
        _createElementVNode("button", {
          class: "button small",
          disabled: !_ctx.account.player,
          onClick: _ctx.doMission
        }, _toDisplayString(_ctx.t('mission')), 9 /* TEXT, PROPS */, _hoisted_10)
      ]),
      _renderSlot(_ctx.$slots, "trailing")
    ], 2 /* CLASS */),
    (_ctx.account.alerts.length)
      ? (_openBlock(), _createElementBlock("tr", _hoisted_11, [
          _createElementVNode("td", _hoisted_12, [
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.account.alerts, (text) => {
              return (_openBlock(), _createElementBlock("p", {
                key: text,
                class: "alert"
              }, _toDisplayString(text), 1 /* TEXT */))
            }), 128 /* KEYED_FRAGMENT */))
          ])
        ]))
      : _createCommentVNode("v-if", true)
  ], 64 /* STABLE_FRAGMENT */))
}