import { toDisplayString as _toDisplayString, createElementVNode as _createElementVNode, normalizeClass as _normalizeClass, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, vModelText as _vModelText, withKeys as _withKeys, withDirectives as _withDirectives, renderList as _renderList, Fragment as _Fragment, withModifiers as _withModifiers, vModelSelect as _vModelSelect, createTextVNode as _createTextVNode, resolveComponent as _resolveComponent, withCtx as _withCtx, createBlock as _createBlock } from "./vue.esm-browser.prod.js"

const _hoisted_1 = { class: "card-head" }
const _hoisted_2 = ["onClick"]
const _hoisted_3 = ["onClick"]
const _hoisted_4 = ["onClick"]
const _hoisted_5 = { class: "party-status" }
const _hoisted_6 = { class: "combo" }
const _hoisted_7 = ["onUpdate:modelValue", "placeholder", "aria-label", "onFocus", "onBlur", "onKeydown"]
const _hoisted_8 = {
  key: 0,
  class: "combo-list"
}
const _hoisted_9 = ["onMousedown", "onClick"]
const _hoisted_10 = {
  key: 0,
  class: "muted"
}
const _hoisted_11 = ["onUpdate:modelValue", "aria-label"]
const _hoisted_12 = ["value"]
const _hoisted_13 = ["onUpdate:modelValue", "aria-label"]
const _hoisted_14 = ["value"]
const _hoisted_15 = ["onClick"]
const _hoisted_16 = ["onClick"]
const _hoisted_17 = {
  ref: "settingsDialog",
  class: "dialog"
}
const _hoisted_18 = { class: "stack" }
const _hoisted_19 = ["value", "onChange"]
const _hoisted_20 = { class: "dialog-actions" }
const _hoisted_21 = ["onClick"]
const _hoisted_22 = { class: "char-list" }
const _hoisted_23 = {
  key: 0,
  class: "empty"
}
const _hoisted_24 = {
  key: 0,
  class: "badge role-leader"
}
const _hoisted_25 = {
  key: 1,
  class: "badge role-tank"
}
const _hoisted_26 = { class: "row-party-controls" }
const _hoisted_27 = ["onClick"]
const _hoisted_28 = ["onClick"]
const _hoisted_29 = ["onClick"]
const _hoisted_30 = ["onClick"]

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
      _createElementVNode("button", {
        class: "button small primary",
        onClick: $event => (_ctx.startParty(true))
      }, _toDisplayString(_ctx.party.isActive ? _ctx.t('huntHere') : _ctx.t('startParty')), 9 /* TEXT, PROPS */, _hoisted_2),
      _createElementVNode("button", {
        class: "button small",
        onClick: $event => (_ctx.startParty(false))
      }, _toDisplayString(_ctx.t('hold')), 9 /* TEXT, PROPS */, _hoisted_3),
      (_ctx.party.isActive)
        ? (_openBlock(), _createElementBlock("button", {
            key: 0,
            class: "button small danger",
            onClick: _ctx.stopParty
          }, _toDisplayString(_ctx.t('stopParty')), 9 /* TEXT, PROPS */, _hoisted_4))
        : _createCommentVNode("v-if", true),
      _createElementVNode("span", _hoisted_5, _toDisplayString(_ctx.party.status), 1 /* TEXT */),
      _createElementVNode("div", _hoisted_6, [
        _withDirectives(_createElementVNode("input", {
          type: "text",
          "onUpdate:modelValue": $event => ((_ctx.addMemberQuery) = $event),
          placeholder: _ctx.t('addMember'),
          "aria-label": _ctx.t('addMember'),
          onFocus: $event => (_ctx.isAddMemberOpen = true),
          onBlur: $event => (_ctx.isAddMemberOpen = false),
          onKeydown: _withKeys($event => (_ctx.isAddMemberOpen = false), ["esc"])
        }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_7), [
          [_vModelText, _ctx.addMemberQuery]
        ]),
        (_ctx.isAddMemberOpen)
          ? (_openBlock(), _createElementBlock("ul", _hoisted_8, [
              (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.filteredFreeAccounts, (account) => {
                return (_openBlock(), _createElementBlock("li", {
                  key: account.id,
                  class: "combo-option",
                  onMousedown: _withModifiers(() => {}, ["prevent"]),
                  onClick: $event => (_ctx.selectMember(account.id))
                }, _toDisplayString(account.name), 41 /* TEXT, PROPS, NEED_HYDRATION */, _hoisted_9))
              }), 128 /* KEYED_FRAGMENT */)),
              (!_ctx.filteredFreeAccounts.length)
                ? (_openBlock(), _createElementBlock("li", _hoisted_10, _toDisplayString(_ctx.t('noFree')), 1 /* TEXT */))
                : _createCommentVNode("v-if", true)
            ]))
          : _createCommentVNode("v-if", true)
      ]),
      _withDirectives(_createElementVNode("select", {
        "onUpdate:modelValue": $event => ((_ctx.goalFloor) = $event),
        "aria-label": _ctx.t('goalFloor')
      }, [
        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.floorOptions, (floor) => {
          return (_openBlock(), _createElementBlock("option", {
            key: floor,
            value: floor
          }, "F" + _toDisplayString(floor), 9 /* TEXT, PROPS */, _hoisted_12))
        }), 128 /* KEYED_FRAGMENT */))
      ], 8 /* PROPS */, _hoisted_11), [
        [
          _vModelSelect,
          _ctx.goalFloor,
          void 0,
          { number: true }
        ]
      ]),
      _withDirectives(_createElementVNode("select", {
        "onUpdate:modelValue": $event => ((_ctx.goalKind) = $event),
        "aria-label": _ctx.t('goalAreaKind')
      }, [
        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.areaKinds, (kind) => {
          return (_openBlock(), _createElementBlock("option", {
            key: kind,
            value: kind
          }, _toDisplayString(_ctx.t('areaKind_' + kind)), 9 /* TEXT, PROPS */, _hoisted_14))
        }), 128 /* KEYED_FRAGMENT */))
      ], 8 /* PROPS */, _hoisted_13), [
        [_vModelSelect, _ctx.goalKind]
      ]),
      _createElementVNode("button", {
        class: "button small",
        onClick: $event => (_ctx.$refs.settingsDialog.showModal())
      }, _toDisplayString(_ctx.t('settings')), 9 /* TEXT, PROPS */, _hoisted_15),
      _createElementVNode("button", {
        class: "button small danger",
        onClick: _ctx.deleteParty
      }, _toDisplayString(_ctx.t('deleteParty')), 9 /* TEXT, PROPS */, _hoisted_16)
    ]),
    _createElementVNode("dialog", _hoisted_17, [
      _createElementVNode("h3", null, _toDisplayString(_ctx.t('settings')) + " — " + _toDisplayString(_ctx.party.name), 1 /* TEXT */),
      _createElementVNode("div", _hoisted_18, [
        _createElementVNode("label", null, [
          _createTextVNode(_toDisplayString(_ctx.t('retreatLabel')) + " ", 1 /* TEXT */),
          _createElementVNode("input", {
            type: "number",
            min: "10",
            max: "90",
            value: _ctx.party.tankRetreatPct,
            onChange: _ctx.updateRetreat
          }, null, 40 /* PROPS, NEED_HYDRATION */, _hoisted_19)
        ]),
        _createElementVNode("div", _hoisted_20, [
          _createElementVNode("button", {
            type: "button",
            class: "button",
            onClick: $event => (_ctx.$refs.settingsDialog.close())
          }, _toDisplayString(_ctx.t('close')), 9 /* TEXT, PROPS */, _hoisted_21)
        ])
      ])
    ], 512 /* NEED_PATCH */),
    _createElementVNode("div", _hoisted_22, [
      (!_ctx.members.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_23, _toDisplayString(_ctx.t('noMembers')), 1 /* TEXT */))
        : _createCommentVNode("v-if", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.members, (member) => {
        return (_openBlock(), _createBlock(_component_character_row, {
          key: member.id,
          account: member,
          "show-actions": false,
          onOpenProfile: (id) => _ctx.$emit('open-profile', id)
        }, {
          leading: _withCtx(() => [
            (member.id === _ctx.party.leaderId)
              ? (_openBlock(), _createElementBlock("span", _hoisted_24, _toDisplayString(_ctx.t('leader')), 1 /* TEXT */))
              : _createCommentVNode("v-if", true),
            (member.id === _ctx.party.tankId)
              ? (_openBlock(), _createElementBlock("span", _hoisted_25, _toDisplayString(_ctx.t('tank')), 1 /* TEXT */))
              : _createCommentVNode("v-if", true)
          ]),
          trailing: _withCtx(() => [
            _createElementVNode("span", _hoisted_26, [
              (member.id !== _ctx.party.leaderId)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 0,
                    class: "button small",
                    onClick: $event => (_ctx.makeLeader(member.id))
                  }, _toDisplayString(_ctx.t('leader')), 9 /* TEXT, PROPS */, _hoisted_27))
                : _createCommentVNode("v-if", true),
              (member.id === _ctx.party.tankId)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 1,
                    class: "button small",
                    onClick: _ctx.untank
                  }, _toDisplayString(_ctx.t('untank')), 9 /* TEXT, PROPS */, _hoisted_28))
                : (_openBlock(), _createElementBlock("button", {
                    key: 2,
                    class: "button small",
                    onClick: $event => (_ctx.makeTank(member.id))
                  }, _toDisplayString(_ctx.t('tank')), 9 /* TEXT, PROPS */, _hoisted_29)),
              _createElementVNode("button", {
                class: "button small danger",
                onClick: $event => (_ctx.removeMember(member.id))
              }, "✕", 8 /* PROPS */, _hoisted_30)
            ])
          ]),
          _: 2 /* DYNAMIC */
        }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["account", "onOpenProfile"]))
      }), 128 /* KEYED_FRAGMENT */))
    ])
  ], 2 /* CLASS */))
}