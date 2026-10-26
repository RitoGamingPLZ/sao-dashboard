import { createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, renderList as _renderList, Fragment as _Fragment, openBlock as _openBlock, createElementBlock as _createElementBlock, normalizeClass as _normalizeClass, createTextVNode as _createTextVNode, vModelText as _vModelText, withDirectives as _withDirectives, withModifiers as _withModifiers, createCommentVNode as _createCommentVNode, resolveComponent as _resolveComponent, createBlock as _createBlock, vModelSelect as _vModelSelect } from "./vue.esm-browser.prod.js"

const _hoisted_1 = { class: "top-bar" }
const _hoisted_2 = { class: "brand" }
const _hoisted_3 = /*#__PURE__*/_createElementVNode("span", {
  class: "brand-mark",
  "aria-hidden": "true"
}, "⚔", -1 /* HOISTED */)
const _hoisted_4 = /*#__PURE__*/_createElementVNode("h1", null, "Snored Art Online · Command Deck", -1 /* HOISTED */)
const _hoisted_5 = ["data-state"]
const _hoisted_6 = { class: "top-actions" }
const _hoisted_7 = ["onClick"]
const _hoisted_8 = ["onClick"]
const _hoisted_9 = ["onClick"]
const _hoisted_10 = {
  class: "overview",
  "aria-label": "Totals"
}
const _hoisted_11 = { class: "stat-label" }
const _hoisted_12 = { class: "stat-value" }
const _hoisted_13 = { class: "widgets-grid" }
const _hoisted_14 = {
  class: "widget",
  "aria-labelledby": "parties-heading"
}
const _hoisted_15 = { class: "widget-head" }
const _hoisted_16 = { id: "parties-heading" }
const _hoisted_17 = { class: "muted" }
const _hoisted_18 = ["onClick"]
const _hoisted_19 = ["onSubmit"]
const _hoisted_20 = ["onUpdate:modelValue", "placeholder", "aria-label"]
const _hoisted_21 = { class: "button" }
const _hoisted_22 = {
  key: 1,
  class: "empty"
}
const _hoisted_23 = {
  class: "widget",
  "aria-labelledby": "accounts-heading"
}
const _hoisted_24 = { class: "widget-head" }
const _hoisted_25 = { id: "accounts-heading" }
const _hoisted_26 = ["onClick"]
const _hoisted_27 = {
  key: 0,
  class: "empty"
}
const _hoisted_28 = {
  key: 1,
  class: "char-list"
}
const _hoisted_29 = {
  class: "widget",
  "aria-labelledby": "log-heading"
}
const _hoisted_30 = { class: "widget-head" }
const _hoisted_31 = { id: "log-heading" }
const _hoisted_32 = ["onClick"]
const _hoisted_33 = {
  key: 0,
  class: "muted hint"
}
const _hoisted_34 = ["onUpdate:modelValue", "aria-label"]
const _hoisted_35 = { value: "" }
const _hoisted_36 = ["value"]
const _hoisted_37 = { class: "event-log" }
const _hoisted_38 = { class: "log-account" }
const _hoisted_39 = { class: "log-detail" }
const _hoisted_40 = {
  ref: "profileDialog",
  class: "dialog"
}
const _hoisted_41 = { class: "level" }
const _hoisted_42 = { class: "stack" }
const _hoisted_43 = { class: "section-title" }
const _hoisted_44 = ["value", "onChange"]
const _hoisted_45 = { value: "" }
const _hoisted_46 = ["value"]
const _hoisted_47 = { class: "section-title" }
const _hoisted_48 = {
  key: 0,
  class: "plain-list"
}
const _hoisted_49 = {
  key: 1,
  class: "muted"
}
const _hoisted_50 = { class: "section-title" }
const _hoisted_51 = {
  key: 0,
  class: "plain-list"
}
const _hoisted_52 = {
  key: 1,
  class: "muted"
}
const _hoisted_53 = {
  key: 0,
  class: "alert"
}
const _hoisted_54 = ["onClick"]
const _hoisted_55 = {
  class: "dialog-actions",
  style: {"justify-content":"flex-start","flex-wrap":"wrap"}
}
const _hoisted_56 = ["onClick"]
const _hoisted_57 = ["onClick"]
const _hoisted_58 = ["onClick"]
const _hoisted_59 = ["onClick"]
const _hoisted_60 = { class: "dialog-actions" }
const _hoisted_61 = ["onClick"]

export function render(_ctx, _cache) {
  const _component_party_card = _resolveComponent("party-card")
  const _component_character_row = _resolveComponent("character-row")

  return (_openBlock(), _createElementBlock(_Fragment, null, [
    _createElementVNode("header", _hoisted_1, [
      _createElementVNode("div", _hoisted_2, [
        _hoisted_3,
        _hoisted_4,
        _createElementVNode("span", {
          class: "link-status",
          "data-state": _ctx.linkState
        }, _toDisplayString(_ctx.linkLabel), 9 /* TEXT, PROPS */, _hoisted_5)
      ]),
      _createElementVNode("div", _hoisted_6, [
        _createElementVNode("button", {
          class: "button small",
          onClick: _ctx.toggleLang
        }, _toDisplayString(_ctx.i18nState.lang === 'en' ? '中文' : 'EN'), 9 /* TEXT, PROPS */, _hoisted_7),
        _createElementVNode("button", {
          class: "button primary",
          onClick: _ctx.openAddAccountDialog
        }, _toDisplayString(_ctx.t('addAccount')), 9 /* TEXT, PROPS */, _hoisted_8),
        _createElementVNode("button", {
          class: "button danger",
          title: "Stop every party and every hunt",
          onClick: _ctx.pauseAll
        }, _toDisplayString(_ctx.t('pauseAll')), 9 /* TEXT, PROPS */, _hoisted_9)
      ])
    ]),
    _createElementVNode("main", null, [
      _createElementVNode("section", _hoisted_10, [
        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.overviewTiles, (tile) => {
          return (_openBlock(), _createElementBlock("div", {
            class: _normalizeClass(["stat-tile", tile.tone]),
            key: tile.label
          }, [
            _createElementVNode("span", _hoisted_11, _toDisplayString(tile.label), 1 /* TEXT */),
            _createElementVNode("span", _hoisted_12, _toDisplayString(tile.value), 1 /* TEXT */)
          ], 2 /* CLASS */))
        }), 128 /* KEYED_FRAGMENT */))
      ]),
      _createElementVNode("div", _hoisted_13, [
        _createElementVNode("section", _hoisted_14, [
          _createElementVNode("div", _hoisted_15, [
            _createElementVNode("h2", _hoisted_16, [
              _createTextVNode(_toDisplayString(_ctx.t('parties')) + " ", 1 /* TEXT */),
              _createElementVNode("span", _hoisted_17, "(" + _toDisplayString(_ctx.activePartiesCount) + " " + _toDisplayString(_ctx.t('active')) + ")", 1 /* TEXT */)
            ]),
            _createElementVNode("button", {
              class: "button small",
              onClick: $event => (_ctx.isAddingParty = !_ctx.isAddingParty)
            }, _toDisplayString(_ctx.t('newParty')), 9 /* TEXT, PROPS */, _hoisted_18)
          ]),
          (_ctx.isAddingParty)
            ? (_openBlock(), _createElementBlock("form", {
                key: 0,
                class: "inline-form",
                onSubmit: _withModifiers(_ctx.createParty, ["prevent"])
              }, [
                _withDirectives(_createElementVNode("input", {
                  "onUpdate:modelValue": $event => ((_ctx.newPartyName) = $event),
                  placeholder: _ctx.t('partyNamePlaceholder'),
                  maxlength: "32",
                  "aria-label": _ctx.t('partyNamePlaceholder'),
                  autofocus: ""
                }, null, 8 /* PROPS */, _hoisted_20), [
                  [_vModelText, _ctx.newPartyName]
                ]),
                _createElementVNode("button", _hoisted_21, _toDisplayString(_ctx.t('create')), 1 /* TEXT */)
              ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_19))
            : _createCommentVNode("v-if", true),
          (!_ctx.snapshot.parties.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_22, _toDisplayString(_ctx.t('noParties')), 1 /* TEXT */))
            : _createCommentVNode("v-if", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.snapshot.parties, (party) => {
            return (_openBlock(), _createBlock(_component_party_card, {
              key: party.id,
              party: party,
              accounts: _ctx.snapshot.accounts,
              "taken-ids": _ctx.takenAccountIds,
              onOpenProfile: _ctx.openProfile
            }, null, 8 /* PROPS */, ["party", "accounts", "taken-ids", "onOpenProfile"]))
          }), 128 /* KEYED_FRAGMENT */))
        ]),
        _createElementVNode("section", _hoisted_23, [
          _createElementVNode("div", _hoisted_24, [
            _createElementVNode("h2", _hoisted_25, _toDisplayString(_ctx.t('characters')) + " (" + _toDisplayString(_ctx.snapshot.accounts.length) + ")", 1 /* TEXT */),
            _createElementVNode("button", {
              class: "button small",
              onClick: _ctx.openAddAccountDialog
            }, _toDisplayString(_ctx.t('addAccount')), 9 /* TEXT, PROPS */, _hoisted_26)
          ]),
          (!_ctx.snapshot.accounts.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_27, _toDisplayString(_ctx.t('noAccounts')), 1 /* TEXT */))
            : (_openBlock(), _createElementBlock("div", _hoisted_28, [
                (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.snapshot.accounts, (account) => {
                  return (_openBlock(), _createBlock(_component_character_row, {
                    key: account.id,
                    account: account,
                    onOpenProfile: _ctx.openProfile
                  }, null, 8 /* PROPS */, ["account", "onOpenProfile"]))
                }), 128 /* KEYED_FRAGMENT */))
              ]))
        ]),
        _createElementVNode("section", _hoisted_29, [
          _createElementVNode("div", _hoisted_30, [
            _createElementVNode("h2", _hoisted_31, _toDisplayString(_ctx.t('eventLog')), 1 /* TEXT */),
            _createElementVNode("button", {
              class: "button small",
              onClick: $event => (_ctx.isLogOpen = !_ctx.isLogOpen)
            }, _toDisplayString(_ctx.isLogOpen ? _ctx.t('hide') : _ctx.t('show')), 9 /* TEXT, PROPS */, _hoisted_32)
          ]),
          (!_ctx.isLogOpen)
            ? (_openBlock(), _createElementBlock("p", _hoisted_33, [
                _createTextVNode(_toDisplayString(_ctx.logEvents.length) + " " + _toDisplayString(_ctx.t('events')), 1 /* TEXT */),
                (_ctx.latestAlert)
                  ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
                      _createTextVNode(" · " + _toDisplayString(_ctx.latestAlert), 1 /* TEXT */)
                    ], 64 /* STABLE_FRAGMENT */))
                  : _createCommentVNode("v-if", true)
              ]))
            : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
                _withDirectives(_createElementVNode("select", {
                  "onUpdate:modelValue": $event => ((_ctx.logFilter) = $event),
                  "aria-label": _ctx.t('filterByAccount')
                }, [
                  _createElementVNode("option", _hoisted_35, _toDisplayString(_ctx.t('allAccounts')), 1 /* TEXT */),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.snapshot.accounts, (account) => {
                    return (_openBlock(), _createElementBlock("option", {
                      key: account.id,
                      value: account.id
                    }, _toDisplayString(account.name), 9 /* TEXT, PROPS */, _hoisted_36))
                  }), 128 /* KEYED_FRAGMENT */))
                ], 8 /* PROPS */, _hoisted_34), [
                  [_vModelSelect, _ctx.logFilter]
                ]),
                _createElementVNode("ol", _hoisted_37, [
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.visibleLogEvents, (event, i) => {
                    return (_openBlock(), _createElementBlock("li", {
                      key: i,
                      class: _normalizeClass(["log-row", 'kind-' + event.kind])
                    }, [
                      _createElementVNode("time", null, _toDisplayString(_ctx.formatTime(event.ts)), 1 /* TEXT */),
                      _createElementVNode("span", _hoisted_38, _toDisplayString(event.account), 1 /* TEXT */),
                      _createElementVNode("span", _hoisted_39, _toDisplayString(event.source ? event.detail + ' (' + event.source + ')' : event.detail), 1 /* TEXT */)
                    ], 2 /* CLASS */))
                  }), 128 /* KEYED_FRAGMENT */))
                ])
              ], 64 /* STABLE_FRAGMENT */))
        ])
      ])
    ]),
    _createElementVNode("dialog", _hoisted_40, [
      (_ctx.profileAccount)
        ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
            _createElementVNode("h3", null, [
              _createTextVNode(_toDisplayString(_ctx.profileAccount.name) + " ", 1 /* TEXT */),
              _createElementVNode("span", _hoisted_41, "Lv " + _toDisplayString(_ctx.profileAccount.player?.level ?? '—'), 1 /* TEXT */)
            ]),
            _createElementVNode("div", _hoisted_42, [
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_43, _toDisplayString(_ctx.t('weaponGoal')), 1 /* TEXT */),
                _createElementVNode("select", {
                  value: _ctx.profileAccount.preferredWeapon || '',
                  onChange: $event => (_ctx.setWeapon(_ctx.profileAccount, $event.target.value))
                }, [
                  _createElementVNode("option", _hoisted_45, _toDisplayString(_ctx.t('none')), 1 /* TEXT */),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.weaponTypes, (weapon) => {
                    return (_openBlock(), _createElementBlock("option", {
                      key: weapon,
                      value: weapon
                    }, _toDisplayString(weapon), 9 /* TEXT, PROPS */, _hoisted_46))
                  }), 128 /* KEYED_FRAGMENT */))
                ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_44)
              ]),
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_47, _toDisplayString(_ctx.t('skills')), 1 /* TEXT */),
                (_ctx.profileAccount.player?.skills?.length)
                  ? (_openBlock(), _createElementBlock("ul", _hoisted_48, [
                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.profileAccount.player.skills, (skill) => {
                        return (_openBlock(), _createElementBlock("li", { key: skill }, _toDisplayString(skill), 1 /* TEXT */))
                      }), 128 /* KEYED_FRAGMENT */))
                    ]))
                  : (_openBlock(), _createElementBlock("p", _hoisted_49, _toDisplayString(_ctx.t('noData')), 1 /* TEXT */))
              ]),
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_50, _toDisplayString(_ctx.t('equipment')), 1 /* TEXT */),
                (_ctx.profileAccount.player?.equipment && Object.keys(_ctx.profileAccount.player.equipment).length)
                  ? (_openBlock(), _createElementBlock("ul", _hoisted_51, [
                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.profileAccount.player.equipment, (value, slot) => {
                        return (_openBlock(), _createElementBlock("li", { key: slot }, [
                          _createElementVNode("b", null, _toDisplayString(slot) + ":", 1 /* TEXT */),
                          _createTextVNode(" " + _toDisplayString(value), 1 /* TEXT */)
                        ]))
                      }), 128 /* KEYED_FRAGMENT */))
                    ]))
                  : (_openBlock(), _createElementBlock("p", _hoisted_52, _toDisplayString(_ctx.t('noData')), 1 /* TEXT */))
              ]),
              (_ctx.profileAccount.haltReason)
                ? (_openBlock(), _createElementBlock("p", _hoisted_53, [
                    _createTextVNode(_toDisplayString(_ctx.profileAccount.haltReason) + " — ", 1 /* TEXT */),
                    _createElementVNode("button", {
                      class: "button small",
                      onClick: $event => (_ctx.accountAction(_ctx.profileAccount, 'resume'))
                    }, _toDisplayString(_ctx.t('resumeBot')), 9 /* TEXT, PROPS */, _hoisted_54)
                  ]))
                : _createCommentVNode("v-if", true),
              _createElementVNode("div", _hoisted_55, [
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.openSettings(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('healthPotions')), 9 /* TEXT, PROPS */, _hoisted_56),
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.showPassword(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('showPassword')), 9 /* TEXT, PROPS */, _hoisted_57),
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.rawCommand(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('rawCommand')), 9 /* TEXT, PROPS */, _hoisted_58),
                _createElementVNode("button", {
                  type: "button",
                  class: "button danger",
                  onClick: $event => (_ctx.removeAccount(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('removeAccount')), 9 /* TEXT, PROPS */, _hoisted_59)
              ])
            ])
          ], 64 /* STABLE_FRAGMENT */))
        : _createCommentVNode("v-if", true),
      _createElementVNode("div", _hoisted_60, [
        _createElementVNode("button", {
          type: "button",
          class: "button",
          onClick: $event => (_ctx.$refs.profileDialog.close())
        }, _toDisplayString(_ctx.t('close')), 9 /* TEXT, PROPS */, _hoisted_61)
      ])
    ], 512 /* NEED_PATCH */)
  ], 64 /* STABLE_FRAGMENT */))
}