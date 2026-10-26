import { toDisplayString as _toDisplayString, createElementVNode as _createElementVNode, normalizeClass as _normalizeClass, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, renderList as _renderList, Fragment as _Fragment, resolveComponent as _resolveComponent, withCtx as _withCtx, createBlock as _createBlock, vModelSelect as _vModelSelect, withDirectives as _withDirectives, vModelText as _vModelText, createTextVNode as _createTextVNode } from "./vue.esm-browser.prod.js"

const _hoisted_1 = { class: "card-head" }
const _hoisted_2 = { class: "party-status" }
const _hoisted_3 = { class: "char-list" }
const _hoisted_4 = {
  key: 0,
  class: "empty"
}
const _hoisted_5 = {
  key: 0,
  class: "badge role-leader"
}
const _hoisted_6 = {
  key: 1,
  class: "badge role-tank"
}
const _hoisted_7 = { class: "row-party-controls" }
const _hoisted_8 = ["onClick"]
const _hoisted_9 = ["onClick"]
const _hoisted_10 = ["onClick"]
const _hoisted_11 = ["onClick"]
const _hoisted_12 = { class: "party-controls" }
const _hoisted_13 = ["onUpdate:modelValue", "onChange", "aria-label"]
const _hoisted_14 = { value: "" }
const _hoisted_15 = ["value"]
const _hoisted_16 = ["onUpdate:modelValue", "placeholder", "aria-label"]
const _hoisted_17 = ["onClick"]
const _hoisted_18 = ["onClick"]
const _hoisted_19 = ["onClick"]
const _hoisted_20 = { class: "party-options" }
const _hoisted_21 = ["value", "onChange"]
const _hoisted_22 = ["title"]
const _hoisted_23 = ["checked", "onChange"]
const _hoisted_24 = ["onClick"]

export function render(_ctx, _cache) {
  const _component_character_row = _resolveComponent("character-row")

  return (_openBlock(), _createElementBlock("article", {
    class: _normalizeClass(["party-card", { active: _ctx.party.isActive }])
  }, [
    _createElementVNode("div", _hoisted_1, [
      _createElementVNode("h3", null, _toDisplayString(_ctx.party.name), 1 /* TEXT */),
      _createElementVNode("span", {
        class: _normalizeClass(["badge", { on: _ctx.party.isActive }])
      }, _toDisplayString(_ctx.party.isActive ? 'ACTIVE' : 'off'), 3 /* TEXT, CLASS */),
      _createElementVNode("span", _hoisted_2, _toDisplayString(_ctx.party.status), 1 /* TEXT */)
    ]),
    _createElementVNode("div", _hoisted_3, [
      (!_ctx.members.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_4, _toDisplayString(_ctx.t('noMembers')), 1 /* TEXT */))
        : _createCommentVNode("v-if", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.members, (member) => {
        return (_openBlock(), _createBlock(_component_character_row, {
          key: member.id,
          account: member,
          onOpenProfile: (id) => _ctx.$emit('open-profile', id)
        }, {
          leading: _withCtx(() => [
            (member.id === _ctx.party.leaderId)
              ? (_openBlock(), _createElementBlock("span", _hoisted_5, _toDisplayString(_ctx.t('leader')), 1 /* TEXT */))
              : _createCommentVNode("v-if", true),
            (member.id === _ctx.party.tankId)
              ? (_openBlock(), _createElementBlock("span", _hoisted_6, _toDisplayString(_ctx.t('tank')), 1 /* TEXT */))
              : _createCommentVNode("v-if", true)
          ]),
          trailing: _withCtx(() => [
            _createElementVNode("span", _hoisted_7, [
              (member.id !== _ctx.party.leaderId)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 0,
                    class: "button small",
                    onClick: $event => (_ctx.makeLeader(member.id))
                  }, _toDisplayString(_ctx.t('leader')), 9 /* TEXT, PROPS */, _hoisted_8))
                : _createCommentVNode("v-if", true),
              (member.id === _ctx.party.tankId)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 1,
                    class: "button small",
                    onClick: _ctx.untank
                  }, _toDisplayString(_ctx.t('untank')), 9 /* TEXT, PROPS */, _hoisted_9))
                : (_openBlock(), _createElementBlock("button", {
                    key: 2,
                    class: "button small",
                    onClick: $event => (_ctx.makeTank(member.id))
                  }, _toDisplayString(_ctx.t('tank')), 9 /* TEXT, PROPS */, _hoisted_10)),
              _createElementVNode("button", {
                class: "button small danger",
                onClick: $event => (_ctx.removeMember(member.id))
              }, "✕", 8 /* PROPS */, _hoisted_11)
            ])
          ]),
          _: 2 /* DYNAMIC */
        }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["account", "onOpenProfile"]))
      }), 128 /* KEYED_FRAGMENT */))
    ]),
    _createElementVNode("div", _hoisted_12, [
      _withDirectives(_createElementVNode("select", {
        "onUpdate:modelValue": $event => ((_ctx.addMemberId) = $event),
        onChange: _ctx.addMember,
        "aria-label": _ctx.t('addMember')
      }, [
        _createElementVNode("option", _hoisted_14, _toDisplayString(_ctx.freeAccounts.length ? _ctx.t('addMember') : _ctx.t('noFree')), 1 /* TEXT */),
        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.freeAccounts, (account) => {
          return (_openBlock(), _createElementBlock("option", {
            key: account.id,
            value: account.id
          }, _toDisplayString(account.name), 9 /* TEXT, PROPS */, _hoisted_15))
        }), 128 /* KEYED_FRAGMENT */))
      ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_13), [
        [_vModelSelect, _ctx.addMemberId]
      ]),
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": $event => ((_ctx.goalAreaId) = $event),
        placeholder: _ctx.t('goalPlaceholder'),
        "aria-label": _ctx.t('goalPlaceholder')
      }, null, 8 /* PROPS */, _hoisted_16), [
        [_vModelText, _ctx.goalAreaId]
      ]),
      _createElementVNode("button", {
        class: "button primary",
        onClick: $event => (_ctx.startParty(true))
      }, _toDisplayString(_ctx.party.isActive ? _ctx.t('huntHere') : _ctx.t('startParty')), 9 /* TEXT, PROPS */, _hoisted_17),
      _createElementVNode("button", {
        class: "button",
        onClick: $event => (_ctx.startParty(false))
      }, _toDisplayString(_ctx.t('hold')), 9 /* TEXT, PROPS */, _hoisted_18),
      (_ctx.party.isActive)
        ? (_openBlock(), _createElementBlock("button", {
            key: 0,
            class: "button danger",
            onClick: _ctx.stopParty
          }, _toDisplayString(_ctx.t('stopParty')), 9 /* TEXT, PROPS */, _hoisted_19))
        : _createCommentVNode("v-if", true)
    ]),
    _createElementVNode("div", _hoisted_20, [
      _createElementVNode("label", null, [
        _createTextVNode(_toDisplayString(_ctx.t('retreatLabel')) + " ", 1 /* TEXT */),
        _createElementVNode("input", {
          type: "number",
          min: "10",
          max: "90",
          value: _ctx.party.tankRetreatPct,
          onChange: _ctx.updateRetreat
        }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_21)
      ]),
      _createElementVNode("label", {
        class: "checkbox",
        title: _ctx.t('syncLabel')
      }, [
        _createElementVNode("input", {
          type: "checkbox",
          checked: _ctx.party.shouldSyncInGame,
          onChange: _ctx.toggleSync
        }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_23),
        _createTextVNode(" " + _toDisplayString(_ctx.t('syncLabel')), 1 /* TEXT */)
      ], 8 /* PROPS */, _hoisted_22),
      _createElementVNode("button", {
        class: "button small danger",
        onClick: _ctx.deleteParty
      }, _toDisplayString(_ctx.t('deleteParty')), 9 /* TEXT, PROPS */, _hoisted_24)
    ])
  ], 2 /* CLASS */))
}