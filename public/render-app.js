import { createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, renderList as _renderList, Fragment as _Fragment, openBlock as _openBlock, createElementBlock as _createElementBlock, normalizeClass as _normalizeClass, createTextVNode as _createTextVNode, createCommentVNode as _createCommentVNode, resolveComponent as _resolveComponent, createBlock as _createBlock, vModelSelect as _vModelSelect, withDirectives as _withDirectives, vModelText as _vModelText, vModelCheckbox as _vModelCheckbox, withModifiers as _withModifiers } from "./vue.esm-browser.prod.js"

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
const _hoisted_19 = {
  key: 0,
  class: "empty"
}
const _hoisted_20 = {
  class: "widget",
  "aria-labelledby": "accounts-heading"
}
const _hoisted_21 = { class: "widget-head" }
const _hoisted_22 = { id: "accounts-heading" }
const _hoisted_23 = ["onClick"]
const _hoisted_24 = {
  key: 0,
  class: "empty"
}
const _hoisted_25 = {
  key: 1,
  class: "char-list"
}
const _hoisted_26 = {
  class: "widget",
  "aria-labelledby": "log-heading"
}
const _hoisted_27 = { class: "widget-head" }
const _hoisted_28 = { id: "log-heading" }
const _hoisted_29 = ["onUpdate:modelValue", "aria-label"]
const _hoisted_30 = { value: "" }
const _hoisted_31 = ["value"]
const _hoisted_32 = { class: "event-log" }
const _hoisted_33 = { class: "log-account" }
const _hoisted_34 = { class: "log-detail" }
const _hoisted_35 = {
  ref: "profileDialog",
  class: "dialog"
}
const _hoisted_36 = { class: "level" }
const _hoisted_37 = { class: "stack" }
const _hoisted_38 = { class: "section-title" }
const _hoisted_39 = ["value", "onChange"]
const _hoisted_40 = { value: "" }
const _hoisted_41 = ["value"]
const _hoisted_42 = { class: "section-title" }
const _hoisted_43 = {
  key: 0,
  class: "plain-list"
}
const _hoisted_44 = {
  key: 1,
  class: "muted"
}
const _hoisted_45 = { class: "section-title" }
const _hoisted_46 = {
  key: 0,
  class: "plain-list"
}
const _hoisted_47 = {
  key: 1,
  class: "muted"
}
const _hoisted_48 = {
  key: 0,
  class: "alert"
}
const _hoisted_49 = ["onClick"]
const _hoisted_50 = {
  class: "dialog-actions",
  style: {"justify-content":"flex-start","flex-wrap":"wrap"}
}
const _hoisted_51 = ["onClick"]
const _hoisted_52 = ["onClick"]
const _hoisted_53 = ["onClick"]
const _hoisted_54 = ["onClick"]
const _hoisted_55 = { class: "dialog-actions" }
const _hoisted_56 = ["onClick"]
const _hoisted_57 = {
  ref: "createPartyDialog",
  class: "dialog"
}
const _hoisted_58 = ["onSubmit"]
const _hoisted_59 = ["onUpdate:modelValue"]
const _hoisted_60 = { class: "section-title" }
const _hoisted_61 = {
  key: 0,
  class: "muted"
}
const _hoisted_62 = ["value", "onUpdate:modelValue"]
const _hoisted_63 = ["onUpdate:modelValue"]
const _hoisted_64 = { class: "form-error" }
const _hoisted_65 = { class: "dialog-actions" }
const _hoisted_66 = ["onClick"]
const _hoisted_67 = { class: "button primary" }

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
          class: "button small primary",
          onClick: _ctx.openAddAccountDialog
        }, _toDisplayString(_ctx.t('addAccount')), 9 /* TEXT, PROPS */, _hoisted_8),
        _createElementVNode("button", {
          class: "button small danger",
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
              onClick: _ctx.openCreatePartyDialog
            }, _toDisplayString(_ctx.t('newParty')), 9 /* TEXT, PROPS */, _hoisted_18)
          ]),
          (!_ctx.snapshot.parties.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_19, _toDisplayString(_ctx.t('noParties')), 1 /* TEXT */))
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
        _createElementVNode("section", _hoisted_20, [
          _createElementVNode("div", _hoisted_21, [
            _createElementVNode("h2", _hoisted_22, _toDisplayString(_ctx.t('characters')) + " (" + _toDisplayString(_ctx.snapshot.accounts.length) + ")", 1 /* TEXT */),
            _createElementVNode("button", {
              class: "button small",
              onClick: _ctx.openAddAccountDialog
            }, _toDisplayString(_ctx.t('addAccount')), 9 /* TEXT, PROPS */, _hoisted_23)
          ]),
          (!_ctx.snapshot.accounts.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_24, _toDisplayString(_ctx.t('noAccounts')), 1 /* TEXT */))
            : (_openBlock(), _createElementBlock("div", _hoisted_25, [
                (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.snapshot.accounts, (account) => {
                  return (_openBlock(), _createBlock(_component_character_row, {
                    key: account.id,
                    account: account,
                    onOpenProfile: _ctx.openProfile
                  }, null, 8 /* PROPS */, ["account", "onOpenProfile"]))
                }), 128 /* KEYED_FRAGMENT */))
              ]))
        ]),
        _createElementVNode("section", _hoisted_26, [
          _createElementVNode("div", _hoisted_27, [
            _createElementVNode("h2", _hoisted_28, _toDisplayString(_ctx.t('eventLog')), 1 /* TEXT */),
            _withDirectives(_createElementVNode("select", {
              "onUpdate:modelValue": $event => ((_ctx.logFilter) = $event),
              class: "log-filter",
              "aria-label": _ctx.t('filterByAccount')
            }, [
              _createElementVNode("option", _hoisted_30, _toDisplayString(_ctx.t('allAccounts')), 1 /* TEXT */),
              (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.snapshot.accounts, (account) => {
                return (_openBlock(), _createElementBlock("option", {
                  key: account.id,
                  value: account.id
                }, _toDisplayString(account.name), 9 /* TEXT, PROPS */, _hoisted_31))
              }), 128 /* KEYED_FRAGMENT */))
            ], 8 /* PROPS */, _hoisted_29), [
              [_vModelSelect, _ctx.logFilter]
            ])
          ]),
          _createElementVNode("ol", _hoisted_32, [
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.visibleLogEvents, (event, i) => {
              return (_openBlock(), _createElementBlock("li", {
                key: i,
                class: _normalizeClass(["log-row", 'kind-' + event.kind])
              }, [
                _createElementVNode("time", null, _toDisplayString(_ctx.formatTime(event.ts)), 1 /* TEXT */),
                _createElementVNode("span", _hoisted_33, _toDisplayString(event.account), 1 /* TEXT */),
                _createElementVNode("span", _hoisted_34, _toDisplayString(event.source ? event.detail + ' (' + event.source + ')' : event.detail), 1 /* TEXT */)
              ], 2 /* CLASS */))
            }), 128 /* KEYED_FRAGMENT */))
          ])
        ])
      ])
    ]),
    _createElementVNode("dialog", _hoisted_35, [
      (_ctx.profileAccount)
        ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
            _createElementVNode("h3", null, [
              _createTextVNode(_toDisplayString(_ctx.profileAccount.name) + " ", 1 /* TEXT */),
              _createElementVNode("span", _hoisted_36, "Lv " + _toDisplayString(_ctx.profileAccount.player?.level ?? '—'), 1 /* TEXT */)
            ]),
            _createElementVNode("div", _hoisted_37, [
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_38, _toDisplayString(_ctx.t('weaponGoal')), 1 /* TEXT */),
                _createElementVNode("select", {
                  value: _ctx.profileAccount.preferredWeapon || '',
                  onChange: $event => (_ctx.setWeapon(_ctx.profileAccount, $event.target.value))
                }, [
                  _createElementVNode("option", _hoisted_40, _toDisplayString(_ctx.t('none')), 1 /* TEXT */),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.weaponTypes, (weapon) => {
                    return (_openBlock(), _createElementBlock("option", {
                      key: weapon,
                      value: weapon
                    }, _toDisplayString(weapon), 9 /* TEXT, PROPS */, _hoisted_41))
                  }), 128 /* KEYED_FRAGMENT */))
                ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_39)
              ]),
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_42, _toDisplayString(_ctx.t('skills')), 1 /* TEXT */),
                (_ctx.profileAccount.player?.skills?.length)
                  ? (_openBlock(), _createElementBlock("ul", _hoisted_43, [
                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.profileAccount.player.skills, (skill) => {
                        return (_openBlock(), _createElementBlock("li", { key: skill }, _toDisplayString(skill), 1 /* TEXT */))
                      }), 128 /* KEYED_FRAGMENT */))
                    ]))
                  : (_openBlock(), _createElementBlock("p", _hoisted_44, _toDisplayString(_ctx.t('noData')), 1 /* TEXT */))
              ]),
              _createElementVNode("div", null, [
                _createElementVNode("div", _hoisted_45, _toDisplayString(_ctx.t('equipment')), 1 /* TEXT */),
                (_ctx.profileAccount.player?.equipment && Object.keys(_ctx.profileAccount.player.equipment).length)
                  ? (_openBlock(), _createElementBlock("ul", _hoisted_46, [
                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.profileAccount.player.equipment, (value, slot) => {
                        return (_openBlock(), _createElementBlock("li", { key: slot }, [
                          _createElementVNode("b", null, _toDisplayString(slot) + ":", 1 /* TEXT */),
                          _createTextVNode(" " + _toDisplayString(value), 1 /* TEXT */)
                        ]))
                      }), 128 /* KEYED_FRAGMENT */))
                    ]))
                  : (_openBlock(), _createElementBlock("p", _hoisted_47, _toDisplayString(_ctx.t('noData')), 1 /* TEXT */))
              ]),
              (_ctx.profileAccount.haltReason)
                ? (_openBlock(), _createElementBlock("p", _hoisted_48, [
                    _createTextVNode(_toDisplayString(_ctx.profileAccount.haltReason) + " — ", 1 /* TEXT */),
                    _createElementVNode("button", {
                      class: "button small",
                      onClick: $event => (_ctx.accountAction(_ctx.profileAccount, 'resume'))
                    }, _toDisplayString(_ctx.t('resumeBot')), 9 /* TEXT, PROPS */, _hoisted_49)
                  ]))
                : _createCommentVNode("v-if", true),
              _createElementVNode("div", _hoisted_50, [
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.openSettings(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('healthPotions')), 9 /* TEXT, PROPS */, _hoisted_51),
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.showPassword(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('showPassword')), 9 /* TEXT, PROPS */, _hoisted_52),
                _createElementVNode("button", {
                  type: "button",
                  class: "button",
                  onClick: $event => (_ctx.rawCommand(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('rawCommand')), 9 /* TEXT, PROPS */, _hoisted_53),
                _createElementVNode("button", {
                  type: "button",
                  class: "button danger",
                  onClick: $event => (_ctx.removeAccount(_ctx.profileAccount))
                }, _toDisplayString(_ctx.t('removeAccount')), 9 /* TEXT, PROPS */, _hoisted_54)
              ])
            ])
          ], 64 /* STABLE_FRAGMENT */))
        : _createCommentVNode("v-if", true),
      _createElementVNode("div", _hoisted_55, [
        _createElementVNode("button", {
          type: "button",
          class: "button",
          onClick: $event => (_ctx.$refs.profileDialog.close())
        }, _toDisplayString(_ctx.t('close')), 9 /* TEXT, PROPS */, _hoisted_56)
      ])
    ], 512 /* NEED_PATCH */),
    _createElementVNode("dialog", _hoisted_57, [
      _createElementVNode("h3", null, _toDisplayString(_ctx.t('newParty')), 1 /* TEXT */),
      _createElementVNode("form", {
        class: "stack",
        onSubmit: _withModifiers(_ctx.submitCreateParty, ["prevent"])
      }, [
        _createElementVNode("label", null, [
          _createTextVNode(_toDisplayString(_ctx.t('partyNamePlaceholder')) + " ", 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            "onUpdate:modelValue": $event => ((_ctx.newPartyName) = $event),
            required: "",
            maxlength: "32",
            autofocus: ""
          }, null, 8 /* PROPS */, _hoisted_59), [
            [_vModelText, _ctx.newPartyName]
          ])
        ]),
        _createElementVNode("div", null, [
          _createElementVNode("div", _hoisted_60, _toDisplayString(_ctx.t('addMember')), 1 /* TEXT */),
          (!_ctx.freeAccountsForNewParty.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_61, _toDisplayString(_ctx.t('noFree')), 1 /* TEXT */))
            : _createCommentVNode("v-if", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.freeAccountsForNewParty, (account) => {
            return (_openBlock(), _createElementBlock("label", {
              key: account.id,
              class: "checkbox"
            }, [
              _withDirectives(_createElementVNode("input", {
                type: "checkbox",
                value: account.id,
                "onUpdate:modelValue": $event => ((_ctx.newPartyMemberIds) = $event)
              }, null, 8 /* PROPS */, _hoisted_62), [
                [_vModelCheckbox, _ctx.newPartyMemberIds]
              ]),
              _createTextVNode(" " + _toDisplayString(account.name), 1 /* TEXT */)
            ]))
          }), 128 /* KEYED_FRAGMENT */))
        ]),
        _createElementVNode("label", null, [
          _createTextVNode(_toDisplayString(_ctx.t('retreatLabel')) + " ", 1 /* TEXT */),
          _withDirectives(_createElementVNode("input", {
            type: "number",
            min: "10",
            max: "90",
            "onUpdate:modelValue": $event => ((_ctx.newPartyRetreatPct) = $event)
          }, null, 8 /* PROPS */, _hoisted_63), [
            [
              _vModelText,
              _ctx.newPartyRetreatPct,
              void 0,
              { number: true }
            ]
          ])
        ]),
        _createElementVNode("p", _hoisted_64, _toDisplayString(_ctx.createPartyError), 1 /* TEXT */),
        _createElementVNode("div", _hoisted_65, [
          _createElementVNode("button", {
            type: "button",
            class: "button",
            onClick: $event => (_ctx.$refs.createPartyDialog.close())
          }, _toDisplayString(_ctx.t('close')), 9 /* TEXT, PROPS */, _hoisted_66),
          _createElementVNode("button", _hoisted_67, _toDisplayString(_ctx.t('create')), 1 /* TEXT */)
        ])
      ], 40 /* PROPS, NEED_HYDRATION */, _hoisted_58)
    ], 512 /* NEED_PATCH */)
  ], 64 /* STABLE_FRAGMENT */))
}