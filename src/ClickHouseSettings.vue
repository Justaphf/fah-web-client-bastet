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
const control = /[\x00-\x1f\x7f]/
const pem     = /-----BEGIN CERTIFICATE-----[^]+?-----END CERTIFICATE-----/

const states = {
  disabled:        'Disabled',
  unconfigured:    'Enabled but not configured',
  connecting:      'Connecting',
  ok:              'Connected',
  retrying:        'Server unavailable, retrying',
  config_error:    'Settings or permissions are wrong',
  schema_mismatch: 'Tables are not compatible'
}

const step_names = {
  server: 'Server', database: 'Database', tables: 'Tables', insert: 'Insert'
}


// The client takes a URL without a scheme as https
function normalize_url(url) {
  url = (url || '').trim()
  if (url && !/^[a-z][a-z\d+.-]*:\/\//i.test(url)) url = 'https://' + url
  return url
}


// The client counts limits in UTF-8 bytes
function bytes(s) {return new TextEncoder().encode(s).length}


export default {
  props: ['mach', 'saving'],


  data() {
    return {
      form:           undefined,
      saved:          undefined,
      password_set:   false,
      status:         undefined,
      password:       '',
      clear_password: false,
      show_ca:        false,
      denied:         false,
      no_reply:       false,
      load_error:     '',
      testing:        false,
      polling:        false,
      left:           false,
      stale:          false,
      error:          '',
      read_error:     '',
      test:           undefined,
      edits:          0,
      type:           'clickhouse'
    }
  },


  watch: {
    connected(connected) {if (connected) this.reconnected()}
  },


  computed: {
    connected() {return this.mach.is_connected()},
    url()       {return normalize_url(this.form.url)},
    ca()        {return this.form.ca.trim() ? this.form.ca : ''},


    errors() {
      let f = this.form, e = {}

      if (2048 < bytes(this.url))
        e.url = 'The URL can be at most 2048 bytes long'

      else if (this.url) {
        let u
        try {u = new URL(this.url)} catch (err) {}

        if (!u) e.url = 'The URL is not valid'
        else if (!/^https?:$/.test(u.protocol))
          e.url = 'The URL must start with http:// or https:// (the ' +
            'ClickHouse HTTP interface)'
        else if (u.username || u.password)
          e.url = 'Enter the user and password in their own fields'
        else if (/[?#]/.test(this.url))
          e.url = 'The URL cannot have a query or fragment'

      } else if (f.enabled) e.url = 'Enter the URL'

      if (64 < f.database.length)
        e.database = 'The database name can be at most 64 characters long'
      else if (f.database && !/^[A-Za-z_]\w*$/.test(f.database))
        e.database = 'The database name may only contain letters, digits ' +
          'and _ and must not start with a digit'
      else if (!f.database && f.enabled) e.database = 'Enter the database'

      if (256 < bytes(f.user))
        e.user = 'The user can be at most 256 bytes long'
      else if (control.test(f.user))
        e.user = 'The user cannot contain control characters'
      else if (f.enabled && !f.user.trim()) e.user = 'Enter the user'

      if (1024 < bytes(this.password))
        e.password = 'The password can be at most 1024 bytes long'
      else if (control.test(this.password))
        e.password = 'The password cannot contain control characters'

      if (65536 < bytes(this.ca))
        e.ca = 'The CA certificate can be at most 65536 bytes long'
      else if (this.ca && !pem.test(this.ca))
        e.ca = 'Paste one or more PEM certificates'

      let max = f.queue_max
      if (!Number.isInteger(max) || max < 1000 || 10000000 < max)
        e.queue_max = 'The queue limit must be from 1000 to 10000000 rows'

      return e
    },


    // Nothing to save is never invalid
    valid() {
      return !this.form || this.denied || this.$util.isEmpty(this.errors)
    },


    candidate() {
      let {enabled, database, user, queue_max} = this.form
      return {enabled, url: this.url, database, user, ca: this.ca, queue_max}
    },


    changed() {
      if (!this.form || this.denied) return false
      return !!this.password || this.clear_password ||
        !this.$util.isEqual(this.candidate, this.saved)
    },


    // The client keeps the stored password only for the saved URL, user and
    // CA certificate.  Any difference warns.
    password_dropped() {
      let saved = this.saved
      return this.password_set && !this.password && !this.clear_password &&
        (this.url != saved.url || this.form.user != saved.user ||
         this.ca != saved.ca)
    },


    // Also a test started from another browser
    test_running() {
      return this.testing || !!(this.status || {}).testing
    },


    busy()   {return this.saving || this.testing},
    locked() {return this.saving || !this.connected},


    can_test() {
      return this.valid && !!this.url && !!this.form.database && !this.busy &&
        !this.test_running && this.connected
    },


    password_placeholder() {
      if (this.clear_password)   return 'Cleared on Save'
      if (this.password_dropped) return 'Enter it again for these settings'
      if (this.password_set)     return 'Stored, leave empty to keep it'
      return 'None stored'
    },


    clear_title() {
      return (this.clear_password ? 'Keep' : 'Clear') + ' the stored password'
    },


    ca_summary() {
      let count = (this.ca.match(new RegExp(pem, 'g')) || []).length
      if (!this.ca) return 'None'
      return count == 1 ? '1 certificate' : `${count} certificates`
    },


    messages() {
      let l = []
      if (!this.connected) l.push('Not connected to the client')
      l = l.concat(Object.values(this.errors))
      if (this.password_dropped)
        l.push('The stored password is only used with the saved URL, user ' +
          'and CA certificate.  Enter the password again.')
      if (this.stale && this.changed)
        l.push('The saved settings may have changed while the client was ' +
          'disconnected.')
      if (this.read_error) l.push(this.read_error)
      if (this.error) l.push(this.error)
      return l
    },


    state() {
      let s = this.status || {}
      return states[s.state] || s.state || ''
    },


    test_steps() {
      return ((this.test || {}).steps || []).map(step => ({
        name:    step_names[step.name] || step.name,
        result:  step.ok === null ? 'Not run' : step.ok ? 'OK' : 'Failed',
        klass:   step.ok === null ? 'not-run' : step.ok ? 'ok' : 'failed',
        message: step.message
      }))
    }
  },


  mounted() {
    this.load()
    this.timer = setInterval(this.refresh, 15 * 1000)
  },


  beforeUnmount() {
    this.left = true
    clearInterval(this.timer)
    this.password = ''
  },


  methods: {
    format_time(t) {return t ? this.$util.format_time(t) + ' UTC' : 'Never'},


    async request(cmd, data, timeout) {
      let reply = await this.mach.request_clickhouse(cmd, data, timeout)

      if (reply && reply.code == 'local_only') {
        this.denied = true
        clearInterval(this.timer)
      }

      return reply
    },


    set_status(status) {
      this.status = status

      // A busy reply is out of date once no test runs
      if ((this.test || {}).code == 'busy' && !status.testing)
        this.test = undefined
    },


    set_settings(reply, keep_form) {
      this.saved        = reply.config
      this.password_set = reply.password_set
      this.set_status(reply.status)
      if (!keep_form) this.form = Object.assign({}, reply.config)
    },


    async load() {
      this.no_reply   = false
      this.load_error = ''
      let reply = await this.request('clickhouse')
      if (this.left || this.denied) return
      if (!reply) return this.no_reply = true
      if (!reply.config)
        return this.load_error = reply.error || 'No reply from the client'

      this.set_settings(reply)
      this.show_ca = false
    },


    // Keeps unsaved edits
    async reconnected() {
      if (this.left || this.denied) return
      if (!this.form) return this.load()

      let reply = await this.request('clickhouse')
      if (this.left || this.denied || !reply || this.busy) return
      if (!this.read_reply(reply)) return

      this.set_settings(reply, this.changed)

      // Edits that now match the saved values were saved after all
      if (this.changed) this.stale = true
      else this.error = ''
    },


    // A read answered with only an error keeps the form and shows the error
    read_reply(reply) {
      this.read_error = reply.config ? '' : reply.error || ''
      return !!reply.config
    },


    // The settings too while the form is unchanged, they may be changed from
    // another browser
    async refresh() {
      if (!this.form || this.busy || this.polling || !this.connected) return

      let read = !this.changed
      this.polling = true
      let reply = await this.request(read ? 'clickhouse' : 'clickhouse_status')
      this.polling = false

      if (this.left || this.denied || !reply || this.busy) return

      if (reply.state) {
        this.read_error = ''
        this.set_status(reply)

      } else if (this.read_reply(reply)) this.set_settings(reply, this.changed)
    },


    // A test result belongs to the values it was run with
    edited() {
      this.edits++
      this.test = undefined
    },


    toggle_clear() {
      this.clear_password = !this.clear_password
      this.password = ''
      this.edited()
    },


    candidate_data() {
      let data = {config: this.candidate}
      if (this.password) data.password = this.password
      else if (this.clear_password) data.password = ''
      return data
    },


    // Called by the page's Save, which locks the form meanwhile, with the
    // request taken when Save was pressed.  Resolves with whether the client
    // stored the settings.
    async save(data) {
      this.error = ''
      let reply = await this.request('clickhouse', data)

      if (this.left) return !!reply && !!reply.config && !reply.error

      if (!reply || !reply.config) {
        this.error = (reply || {}).error || 'No reply from the client'
        return false
      }

      if (reply.error) {
        this.set_settings(reply, true)
        this.error = reply.error
        return false
      }

      this.set_settings(reply)
      this.password       = ''
      this.clear_password = false
      this.stale          = false
      this.read_error     = ''
      return true
    },


    async run_test() {
      if (!this.can_test) return

      let edits    = this.edits
      this.testing = true
      this.test    = undefined
      let reply =
        await this.request('clickhouse_test', this.candidate_data(), 120)
      this.testing = false

      if (this.left || this.denied) return
      if (edits == this.edits)
        this.test = reply || {ok: false, error: 'No reply from the client'}
      this.refresh()
    }
  }
}
</script>

<template lang="pug">
fieldset.settings.view-panel.clickhouse-settings
  legend
    HelpBalloon(name="External Telemetry TSDB")
      p.
        Send the GPU telemetry and Work Unit start and finish events of this
        machine to an external time series database, for example to build
        your own dashboards.  ClickHouse over its HTTP interface is the only
        type for now.
      p.
        These settings belong to this machine only and can only be changed
        from a browser on the machine itself.
      p.
        Test tries the values in the form without saving them.  It creates
        the tables if they do not exist.  The row counts below, except Rows
        Queued, are since the client started.

  p.clickhouse-note(v-if="denied").
    External Telemetry TSDB settings can only be changed from a browser on
    the machine itself.

  .clickhouse-note(v-else-if="!form && (no_reply || load_error)")
    span {{load_error || 'No reply from the client'}}
    Button(text="Retry", icon="refresh", @click="load")

  p.clickhouse-note(v-else-if="!form") Loading...

  template(v-else)
    .setting
      HelpBalloon(name="Type"): p.
        The kind of database to send to.  ClickHouse over its HTTP interface,
        usually port 8123 for HTTP or 8443 for HTTPS, is the only one
        supported for now.  The native protocol of #[tt clickhouse-client],
        usually ports 9000 and 9440, is not supported.

      select(v-model="type", :disabled="locked", title="Database type")
        option(value="clickhouse") ClickHouse (HTTP)

    template(v-if="type == 'clickhouse'")
      .setting
        HelpBalloon(name="Enabled"): p.
          Send data to the server.  While the server cannot be reached the data
          is queued on this machine and sent later.

        input(v-model="form.enabled", type="checkbox", :disabled="locked",
          title="Send GPU telemetry to ClickHouse")

      .setting
        HelpBalloon(name="URL"): p.
          The address of the ClickHouse HTTP interface, usually port 8123 for
          HTTP or 8443 for HTTPS, for example #[tt https://host:8443].  The
          native protocol of #[tt clickhouse-client], usually ports 9000 and
          9440, is not supported.  A URL without #[tt http://] or
          #[tt https://] is taken as HTTPS.  With #[tt http://] the password
          and the data are sent unencrypted.

        input(v-model="form.url", placeholder="https://host:8443",
          :class="{error: errors.url}", :disabled="locked", spellcheck="false",
          @input="edited", title="ClickHouse server URL")

      .setting
        HelpBalloon(name="Database"): p.
          The database to write to.  It must already exist.  Letters, digits
          and _ only.

        input(v-model="form.database", :class="{error: errors.database}",
          :disabled="locked", spellcheck="false", @input="edited",
          title="ClickHouse database")

      .setting
        HelpBalloon(name="User"): p.
          The ClickHouse user.  It needs permission to create and insert into
          the tables in the database.

        input(v-model="form.user", :class="{error: errors.user}",
          :disabled="locked", spellcheck="false", autocomplete="off",
          @input="edited", title="ClickHouse user")

      .setting
        HelpBalloon(name="Password"): p.
          Stored on this machine in the client's database, not encrypted, and
          never shown again.  Leave empty to keep it.  It is only used with the
          URL, user and CA certificate it was saved with: if you change any of
          them, enter the password again.

        input(v-model="password", type="password", autocomplete="new-password",
          :placeholder="password_placeholder",
          :disabled="clear_password || locked",
          :class="{error: errors.password || password_dropped}",
          @input="edited", title="ClickHouse password")

        .setting-actions(v-if="password_set")
          Button.button-icon(:icon="clear_password ? 'undo' : 'trash'",
            @click="toggle_clear", :disabled="locked",
            :title="clear_title")

      .setting
        HelpBalloon(name="CA Certificate"): p.
          For a server with a self-signed certificate, paste the PEM text of the
          certificate authority to trust.  Not needed for HTTP or for servers
          with a certificate from a public authority.

        .clickhouse-ca
          .clickhouse-ca-summary
            span {{ca_summary}}
            Button(:text="show_ca ? 'Hide' : 'Edit'",
              :icon="show_ca ? 'chevron-up' : 'pencil'",
              @click="show_ca = !show_ca",
              title="Show the CA certificate")

          textarea(v-if="show_ca", v-model="form.ca", rows="8",
            spellcheck="false", :class="{error: errors.ca}", :disabled="locked",
            @input="edited", placeholder="-----BEGIN CERTIFICATE-----",
            title="CA certificate in PEM format")

      .setting
        HelpBalloon(name="Queue Limit"): p.
          The most rows kept on this machine while the server cannot be
          reached, from 1000 to 10000000.  Each row is about 400 bytes; the
          oldest rows are dropped first.  One GPU sampled every second gives
          86400 rows a day.

        input(v-model.number="form.queue_max", type="number", min="1000",
          max="10000000", step="1", :class="{error: errors.queue_max}",
          :disabled="locked",
          title="Rows kept while the server cannot be reached")

      .clickhouse-actions
        .clickhouse-messages
          div(v-for="message in messages") {{message}}

        Button(text="Test", icon="plug", :disabled="!can_test",
          @click="run_test",
          title="Test these settings without saving them")

      .clickhouse-test(v-if="test_running || test")
        p.clickhouse-note(v-if="testing").
          Testing, this can take a minute or more...
        p.clickhouse-test-error(v-else-if="test && test.error") {{test.error}}
        p.clickhouse-note.clickhouse-test-other(v-else-if="test_running").
          A connection test is running

        table.view-table(v-if="test_steps.length")
          thead
            tr
              th Test
              th Result
              th Message

          tbody
            tr(v-for="step in test_steps",
              :class="'clickhouse-step-' + step.klass")
              td {{step.name}}
              td.clickhouse-step-result {{step.result}}
              td.clickhouse-step-message {{step.message}}

      .clickhouse-status(v-if="status")
        .info-group
          info-item(label="State", :content="state")
          info-item(label="Server", :content="status.server_version || '-'")

        .info-group
          info-item(label="Last Insert",
            :content="format_time(status.last_success)",
            title="Last successful insert since the client started")
          info-item(label="Next Retry", v-if="status.next_retry",
            :content="format_time(status.next_retry)")

        .info-group
          info-item(label="Rows Sent", :content="status.rows_sent",
            title="Rows sent since the client started")
          info-item(label="Rows Queued", :content="status.rows_queued")
          info-item(label="Rows Dropped", :content="status.rows_dropped",
            title="Rows dropped since the client started")

        .info-group(v-if="status.rows_truncated")
          info-item(label="Rows Truncated", :content="status.rows_truncated",
            title="Rows truncated since the client started")

        .clickhouse-last-error(v-if="status.last_error")
          label(title="Last error since the client started").
            Last error at {{format_time(status.last_error_time)}}
          div {{status.last_error}}
</template>

<style lang="stylus">
.settings-view fieldset.clickhouse-settings
  .setting > label
    white-space normal

  .clickhouse-note
    margin 0
    display flex
    align-items center
    gap var(--gap)

  .clickhouse-ca
    display flex
    flex-direction column
    gap var(--gap)

    .clickhouse-ca-summary
      display flex
      align-items center
      gap var(--gap)

    textarea
      font-family var(--mono-font)
      width 100%

  .clickhouse-actions
    width 100%
    display flex
    align-items center
    gap var(--gap)

    .clickhouse-messages
      flex 1
      color var(--error-color)

  .clickhouse-test, .clickhouse-status
    width 100%
    display flex
    flex-direction column
    gap var(--gap)

  .clickhouse-test
    p
      margin 0

    .clickhouse-step-message
      white-space normal
      word-break break-word

    .clickhouse-step-ok .clickhouse-step-result
      color var(--success-color)

    .clickhouse-step-failed .clickhouse-step-result
      color var(--error-color)

  .clickhouse-status .info-item span
    white-space normal
    overflow-wrap anywhere

  .clickhouse-last-error
    label
      color var(--subtitle-color)

    div
      font-family var(--mono-font)
      white-space normal
      word-break break-word
</style>
