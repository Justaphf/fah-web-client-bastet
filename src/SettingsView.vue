<!--

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2026, foldingathome.org
                               All rights reserved.

       This program is free software; you can redistribute it and/or modify
       it under the terms of the GNU General Public License as published by
        the Free Software Foundation; either version 3 of the License, or
                       (at your option) any later version.

         This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
                   GNU General Public License for more details.

     You should have received a copy of the GNU General Public License along
     with this program; if not, write to the Free Software Foundation, Inc.,
           51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

-->

<script>
import CommonSettings       from './CommonSettings.vue'
import GroupSettings        from './GroupSettings.vue'
import GPUTelemetrySettings from './GPUTelemetrySettings.vue'


// Clients may report only some of these keys
const telemetry_keys = [
  'gpu_telemetry_interval', 'gpu_telemetry_history', 'gpu_telemetry_continuous',
  'gpu_telemetry_history_days', 'gpu_telemetry_bucket', 'gpu_telemetry_aging',
  'energy_rate']


function copy_keys(config, keys) {
  let copy = {}

  for (let key of keys)
    copy[key] = config[key]

  return copy
}


function last_tab() {
  try {return localStorage.getItem('fah-settings-tab')} catch (e) {}
}


// Routes of one machine's settings page differ only in the tab
function same_page(a, b) {
  let page = route => route.matched[route.matched.length - 1]
  return page(a) == page(b) && a.params.machID == b.params.machID
}


export default {
  inheritAttrs: false,
  props: ['mach', 'route_tab'],
  components: {CommonSettings, GroupSettings, GPUTelemetrySettings},


  data() {
    return {
      name:            this.mach.get_name(),
      draft_id:        this.mach.get_id(),
      initial_config:  undefined,
      config:          undefined,
      group:           '',
      new_group:       '',
      confirmed:       false,
      saving:          false,
      unlocked:        this.$util.retrieve_bool('fah-settings-unlocked'),

      confirm_dialog_buttons: [
        {name: 'cancel',  icon: 'times'},
        {name: 'discard', icon: 'trash'},
        {name: 'save',    icon: 'floppy-o'}
      ],
    }
  },


  watch: {
    'data.config'() {this.init()},


    // Remember the tab for next time
    tab: {
      immediate: true,
      handler(tab) {
        if (tab == this.route_tab)
          try {localStorage.setItem('fah-settings-tab', tab)} catch (e) {}
      }
    },


    url_tab(tab) {if (tab) this.$router.replace({params: {tab}})}
  },


  computed: {
    logged_in() {return this.$account.logged_in},
    connected()    {return this.mach.is_connected()},
    linked()       {return this.mach.is_linked()},
    valid_name()   {return /^[\w\.-]{1,64}$/.test(this.name)},

    advanced() {
      if (this.unlocked) return true

      let config = this.config || {}

      for (let [name, group] of Object.entries(config.groups || {}))
        if (name || group.key || group.beta) return true

      return false
    },


    keys() {
      let keys = ['on_idle', 'cpus', 'gpus', 'beta', 'key']

      if (!this.logged_in)
        return keys.concat(['user', 'team', 'passkey', 'cause'])

      return keys
    },


    info()    {return this.mach.get_info()},
    data()    {return this.mach.get_data()},
    groups()  {return (this.config || {}).groups || {}},
    version() {return this.mach.get_version()},


    name_modified() {return this.name != this.mach.get_name()},


    // No draft until the machine has sent its configuration
    config_modified() {
      return !!this.config &&
        !this.$util.isEqual(this.initial_config, this.config)
    },


    modified() {
      if (!this.valid_name) return false
      if (!(this.$refs.common || {valid: true}).valid) return false
      if (!(this.$refs.telemetry || {valid: true}).valid) return false
      if (!this.wu_display_limit_valid) return false
      if (this.name_modified) return true
      if (!this.config) return false
      return this.config_modified
    },


    available_cpus() {return this.info ? this.info.cpus : 0},
    available_gpus() {return this.info ? this.info.gpus : {}},


    gpus() {
      let gpus = []

      for (const [id, info] of Object.entries(this.available_gpus))
        gpus.push(Object.assign({id, supported: true}, info))

      return gpus
    },


    telemetry_gpus() {return this.gpus.filter(gpu => gpu.nvml)},


    has_telemetry() {
      return (this.config || {}).gpu_telemetry != undefined &&
        0 < this.telemetry_gpus.length
    },


    has_wu_display_limit() {return 'wu_display_limit' in (this.config || {})},


    wu_display_limit_valid() {
      let limit = (this.config || {}).wu_display_limit
      return !this.has_wu_display_limit ||
        (Number.isInteger(limit) && 1 <= limit && limit <= 2000)
    },


    show_telemetry() {return this.connected && this.has_telemetry},


    tabs() {
      let tabs = [{id: 'machine', name: 'Machine', icon: 'cog'}]

      if (this.show_telemetry)
        tabs.push({id: 'telemetry', name: 'GPU Telemetry',
                   icon: 'thermometer-half'})

      return tabs
    },


    // The tab the URL names, else the last used one, else the first
    tab() {
      let tab = this.route_tab || last_tab()
      return this.tabs.some(t => t.id == tab) ? tab : 'machine'
    },


    // The tab the URL should name instead, once the tabs are known.  With
    // only the first tab the URL needs none.
    url_tab() {
      let tab = this.route_tab
      if (!this.config || (!tab && this.tabs.length < 2)) return
      if (tab != this.tab) return this.tab
    }
  },


  beforeRouteLeave(to, from) {
    if (this.confirmed || !this.unsaved()) return true

    this.$refs.confirm_dialog.exec().then(response => {
      switch (response) {
      case 'save': return this.save()

      case 'discard':
        this.approve()
        this.$router.push(to)
      }
    })

    return false
  },


  // Another machine's settings get a new page, an approval is used up here
  beforeRouteUpdate(to, from) {
    if (to.params.machID == from.params.machID) return true

    let approved = this.confirmed
    this.confirmed = false

    if (approved || !this.unsaved()) return true

    this.$refs.confirm_dialog.exec().then(response => {
      switch (response) {
      case 'save': return this.save(to)

      case 'discard':
        this.approve()
        this.$router.push(to)
      }
    })

    return false
  },


  mounted() {
    this.init()
    window.addEventListener('beforeunload', this.before_unload)
  },


  unmounted() {window.removeEventListener('beforeunload', this.before_unload)},


  methods: {
    // Lets the browser ask before a reload or leaving the app loses changes
    before_unload(e) {
      if (this.confirmed || !this.unsaved()) return
      e.preventDefault()
      e.returnValue = true // Older browsers
    },


    async link() {
      this.mach.set_name(this.name)
      this.mach.link(this.$adata.token)
    },


    async unlink() {
      let response = await this.$root.message('confirm', 'Unlink machine?',
        '<p>If you unlink this machine you will lose remote access.</p>' +
        '<p>Are you sure you want to unlink?', ['no', 'yes'])
      if (response != 'yes') return
      await this.mach.unlink()
      await this.$account.update()
      this.$router.back()
    },


    get_group_config(config) {
      let keys = ['on_idle', 'cpus', 'gpus', 'beta', 'key', 'cuda', 'hip']
      let copy = copy_keys(config, keys)

      copy.on_idle = !!copy.on_idle
      copy.cpus    = copy.cpus || 0
      copy.beta    = !!copy.beta
      copy.key     = copy.key || 0
      copy.cuda    = copy.cuda == undefined ? true : copy.cuda
      copy.hip     = copy.hip  == undefined ? true : copy.hip

      if (this.$util.version_less('8.3.1', this.version)) {
        copy.on_battery = !!config.on_battery
        copy.keep_awake = !!config.keep_awake
      }

      if (this.$util.version_less('8.5.6', this.version))
        copy.pin_to_perf_cores = !!config.pin_to_perf_cores

      let config_gpus = config.gpus || {}
      copy.gpus = {}
      for (let id in this.available_gpus) {
        const enabled = (config_gpus[id] || {}).enabled || false
        copy.gpus[id] = {enabled}
      }

      // Add GPUs which are enabled but not detected
      for (const [id, gpu] of Object.entries(config_gpus))
        if (gpu.enabled && !copy.gpus[id]) copy.gpus[id] = {enabled: true}

      return copy
    },


    get_account_config(config) {
      let copy = copy_keys(config, ['user', 'team', 'passkey', 'cause'])

      if (!copy.cause || copy.cause == 'unspecified') copy.cause = 'any'
      copy.cause = copy.cause.toLowerCase()

      return copy
    },


    // Only sent to clients which report these keys
    get_telemetry_config(config) {
      if (config.gpu_telemetry == undefined) return {}

      let monitored = {}
      for (const [id, enabled] of Object.entries(config.gpu_telemetry))
        if (enabled) monitored[id] = true

      let copy = {gpu_telemetry: monitored}

      for (let key of telemetry_keys)
        if (key in config) copy[key] = config[key]

      // Copied so that edits do not change the client's data before Save.
      // Malformed values load as empty or invalid rows rather than NaN.
      if ('gpu_telemetry_aging' in copy) {
        let aging = copy.gpu_telemetry_aging
        copy.gpu_telemetry_aging = !Array.isArray(aging) ? [] :
          aging.map(tier => ({days:   Number((tier || {}).days)   || 0,
                              bucket: Number((tier || {}).bucket) || 0}))
      }

      return copy
    },


    init() {
      let config = this.data.config
      if (this.config || !config || this.$util.isEmpty(config)) return

      let telemetry = this.get_telemetry_config(config)
      let limit = config.wu_display_limit
      config = this.logged_in ? {} : this.get_account_config(config)
      Object.assign(config, telemetry)
      if (limit != undefined) config.wu_display_limit = limit

      if (!this.data.groups)
        config.groups = {'': this.get_group_config(config)}

      else {
        config.groups = {}

        for (const [name, group] of Object.entries(this.data.groups))
          config.groups[name] = this.get_group_config(group.config)
      }

      this.config = config
      this.initial_config = this.$util.deepCopy(this.config)
      this.draft_id = this.mach.get_id()
    },


    // Only valid settings are sent, as they were when Save was pressed.  Edits
    // made while saving stay unsaved.
    async save(to) {
      if (this.saving) return

      let saved = this.modified

      if (saved) {
        let name   = this.name_modified   && this.name
        let config = this.config_modified && this.$util.deepCopy(this.config)
        let target = this.mach.get_target()
        let left   = false
        let unsent = false
        let done   = this.$router.afterEach((next, prev, failure) => {
          if (!failure && !same_page(next, prev)) left = true
        })

        this.saving = true

        try {
          // Nothing of a draft goes to a client it was not taken from
          unsent = target.id != this.draft_id
          if (name && !unsent) await this.mach.save_name(name)

          // Not sent without a connection, which may be lost during a rename,
          // nor to another client the direct connection was pointed at
          if (config && !this.mach.is_connected_to(target))
            unsent = true

          else if (config && !unsent) {
            await this.mach.configure(config)
            this.initial_config = config
          }

        } finally {
          this.saving = false
          done()
        }

        if (unsent)
          this.$root.message('error', 'Save Failed', 'The machine is not ' +
            'connected.  Its settings were not saved.')

        // Stay where the user went meanwhile
        if (left) return
      }

      // Shows an invalid field
      let tab = !saved && this.unsaved() &&
        ['machine', 'telemetry'].find(id => this.tab_invalid(id))

      if (tab) {
        if (tab != this.tab) await this.$router.replace({params: {tab}})
        await this.$nextTick()
        return this.show_problem()
      }

      if (!saved || this.unsaved()) return
      if (!to) return this.close()

      this.approve()
      this.$router.push(to)
    },


    show_problem() {
      let field = [...this.$refs.page.querySelectorAll('.error')]
        .find(e => e.offsetParent)
      if (field) field.scrollIntoView({block: 'center'})
    },


    // The telemetry tab edits these config keys, the first tab all others
    tab_config_modified(id) {
      let keys = ['gpu_telemetry', ...telemetry_keys]
      let pick = config => Object.fromEntries(Object.entries(config || {})
        .filter(([key]) => keys.includes(key) == (id == 'telemetry')))

      return !this.$util.isEqual(pick(this.initial_config), pick(this.config))
    },


    tab_unsaved(id) {
      switch (id) {
      case 'machine':
        return this.name_modified || this.tab_config_modified(id)
      case 'telemetry': return this.tab_config_modified(id)
      }
    },


    tab_invalid(id) {
      switch (id) {
      case 'machine':
        return !this.valid_name || !this.wu_display_limit_valid ||
          !(this.$refs.common || {valid: true}).valid
      case 'telemetry': return !(this.$refs.telemetry || {valid: true}).valid
      }
    },


    tab_class(id) {
      let invalid = this.tab_invalid(id)

      return {
        'tab-active':  this.tab == id,
        'tab-invalid': invalid,
        'tab-unsaved': !invalid && this.tab_unsaved(id)
      }
    },


    // A path, so that the tab is also a link
    tab_path(id) {return this.$router.resolve({params: {tab: id}}).path},


    // Explains a mark, no title without one
    tab_title(t) {
      if (this.tab_invalid(t.id)) return t.name + ': a value is not valid'
      if (this.tab_unsaved(t.id)) return t.name + ': unsaved changes'
    },


    // Edits not saved yet, valid or not
    unsaved() {return this.name_modified || this.config_modified},


    cancel() {this.close()},


    // Opened first in a browser tab, there is no page of the app to go back to
    close() {
      this.approve()
      if ((history.state || {}).back) this.$router.back()
      else this.$router.replace('/')
    },


    // Lets only the next navigation through without asking, a tab change
    // does not count
    approve() {
      this.confirmed = true
      let done = this.$router.afterEach((to, from) => {
        if (same_page(to, from)) return
        done()
        this.confirmed = false
      })
    },


    async add_group() {
      this.new_group = ''
      let result = await this.$refs.new_group_dialog.exec()
      if (result != 'create') return

      let name = this.new_group.trim()
      if (!(name in this.config.groups))
        this.config.groups[name] = this.get_group_config({})

      this.group = name
    },


    async del_group() {
      let result = await this.$root.message(
        'confirm', 'Delete Resource Group?', 'Are you sure you want to ' +
          ' delete resource group "' + this.group + '"?', 'Cancel Delete')

      if (result != 'delete') return

      delete this.config.groups[this.group]
      this.group = ''
    },


    async unlock() {
      let result = await this.$root.message(
        'confirm', 'Unlock Advanced Settings?', '<p>Advanced settings are ' +
          'mainly used for testing Folding@home.</p><p>Are you sure you ' +
          'want to unlock advanced settings?</p>', 'Cancel Unlock')

      if (result != 'unlock') return

      this.unlocked = true
      this.$util.store_bool('fah-settings-unlocked', true)
    }
  }
}
</script>

<template lang="pug">
Dialog(ref="confirm_dialog", :buttons="confirm_dialog_buttons")
  template(v-slot:header) Unsaved changes
  template(v-slot:body).
    You have unsaved configuration changes.  Would you like to save your
    changes, discard them or cancel and stay on this page?

Dialog.new-group-dialog(ref="new_group_dialog", buttons="Create")
  template(v-slot:header) Add New Resource Group
  template(v-slot:body)
    label Name
    input(v-model="new_group", focused,
      @keyup.enter="$refs.new_group_dialog.close('create')")

.settings-view.page-view(:class="{tabbed: 1 < tabs.length}", ref="page")
  ViewHeader(title="Settings", :subtitle="mach.get_name()")
    template(v-slot:actions)
      Button(@click="cancel", text="Cancel", icon="times")

      Button(:disabled="!modified || saving", @click="save()", success,
        text="Save", icon="save")

  .tab-menu(v-if="1 < tabs.length")
    Button(v-for="t in tabs", :key="t.id", :text="t.name", :icon="t.icon",
      :class="tab_class(t.id)", :title="tab_title(t)", replace,
      :route="tab_path(t.id)")

  .view-body
    fieldset.settings.view-panel(v-if="logged_in", v-show="tab == 'machine'")
      legend
        HelpBalloon(name="Machine")
          p You can rename the machine or unlink a machine you no longer use.
          p.
            Machine names can be from 1 to 64 characters in length and may
            include a-z, 0-9, dashes (-) and dots (.).
          p.
            If the local machine is linked to another account you can link it to
            this account by clicking on the #[span.fa.fa-link] icon.

      .setting
        label Name
        input(v-model="name", :class="{error: !valid_name}")

        .setting-actions
          Button.button-icon(v-if="linked", @click="unlink",
            icon="unlink", title="Unlink machine from this account")

          Button.button-icon(v-if="!linked", @click="link", icon="link",
            :disabled="!valid_name", title="Link machine to this account")

    fieldset.settings.view-panel(v-if="!logged_in && config",
      v-show="tab == 'machine'")
      legend Account Settings
      CommonSettings(:config="config", ref="common")

    .view-pane(v-if="connected && config", v-show="tab == 'machine'")
      fieldset.view-panel.resource-groups(v-if="advanced")
        legend Resource Groups

        Button(v-for="(g, name) in groups", :text="name || 'Default'",
          :class="{active: group == name}", :disabled="name == group",
          @click="group = name")

        .actions
          Button(@click="del_group", icon="trash", text="Delete",
            :title="'Delete resource group ' + group", :disabled="!group")

          Button(@click="add_group", icon="plus", text="Add",
            title="Add a new resource group")

      component.group-settings(:is="advanced ? 'fieldset' : 'div'",
        :class="{'view-panel': advanced}")
        legend(v-if="advanced")
          | {{group ? '' : 'Default'}} Resource Group {{group}}

        GroupSettings(:config="groups[group]", :cpus="available_cpus",
          :gpus="gpus", :advanced="advanced", :version="version")

    fieldset.settings.view-panel(v-if="connected && has_wu_display_limit",
      v-show="tab == 'machine'")
      legend Work Units

      .setting
        HelpBalloon(name="Display Limit"): p.
          The number of most recent finished Work Units this machine sends to
          the Work Units page, from 1 to 2000.  Each machine has its own
          limit.  Large values make the Work Units page slower.  Older Work
          Units are not deleted.

        input(v-model.number="config.wu_display_limit", type="number",
          min="1", max="2000", step="1",
          :class="{error: !wu_display_limit_valid}",
          title="Number of finished Work Units to show")

    GPUTelemetrySettings(v-if="show_telemetry", v-show="tab == 'telemetry'",
      ref="telemetry", :config="config", :gpus="telemetry_gpus")

  .actions(v-show="tab == 'machine'")
    Button.button-icon(v-if="!advanced && connected", @click="unlock",
      icon="lock", title="Unlock advanced settings")
</template>

<style lang="stylus">
.settings-view
  // The tab menu left of the panels, header and actions across.  Too wide
  // panels overflow the page, the header and actions keep its width.
  &.tabbed
    display grid
    grid-template-columns auto minmax(0, 1fr)

    > .view-header, > .actions
      grid-column 1 / -1

    > .view-body
      min-width min-content

  // Room for a mark on every tab, so a mark does not widen the menu
  .tab-menu > .button::after
    content ''
    width 1em
    margin-left auto
    text-align center
    font-family FontAwesome
    font-weight normal

  .tab-menu > .button.tab-unsaved::after
    content '\f111' // fa-circle
    transform scale(0.5)
    color var(--link-alt)

  .tab-menu > .button.tab-invalid::after
    content '\f06a' // fa-exclamation-circle
    color var(--error-color)

  .view-body .view-pane
    display flex
    flex-direction row
    gap var(--gap)

    .resource-groups
      flex-direction column
      gap var(--gap)
      align-items stretch
      display flex
      width auto

      > .button
        justify-content left

      .actions
        flex 1
        flex-direction row
        align-items end

    .group-settings
      display flex
      flex-direction column
      gap var(--gap)
      flex 1

  .actions
    display flex
    justify-content end
    gap var(--gap)

  > .actions
    opacity 0.4

.new-group-dialog .dialog-body
  display flex
  gap var(--gap)

  input
    flex 1

@media (max-width 800px)
  .settings-view .view-body .view-pane .resource-groups > .actions
    flex-direction column
    align-items normal

    .button
      justify-content left
</style>
