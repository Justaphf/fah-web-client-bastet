/******************************************************************************\

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

\******************************************************************************/

import {reactive, toRaw} from 'vue'
import Updatable from './updatable.js'
import Unit      from './unit.js'


const history_max  = 6000          // The client sends at most 5000 rows
const history_runs = 20000         // One per recorded stretch of a unit
const history_span = 400 * 86400   // It clamps a range to 366 days
const time_max     = 8.64e12       // The Date range in seconds
const value_max    = 1e18
const text_max     = 256


function is_num(x, max = value_max) {
  return typeof x == 'number' && Math.abs(x) <= max
}


function is_time(t) {return is_num(t, time_max)}
function is_text(s) {return typeof s == 'string' && s.length <= text_max}
function is_obj(x)  {return !!x && typeof x == 'object' && !Array.isArray(x)}


function is_list(x, max = history_max) {
  return Array.isArray(x) && x.length <= max
}


function is_tuple(x, n, valid = is_num) {
  return Array.isArray(x) && x.length == n && x.every(e => valid(e))
}


// A plain object of the entries copy() returns, undefined if it returns
// undefined for any.  Keys like Vue's __v_isRef or __proto__ would change
// how the value is read.
function copy_entries(o, max, copy) {
  let entries = is_obj(o) && Object.entries(o)
  if (!entries || max < entries.length) return

  let c = {}
  for (let [k, v] of entries) {
    if (!is_text(k) || k.startsWith('__')) return
    if ((c[k] = copy(k, v)) === undefined) return
  }

  return c
}


// Totals are numbers, a field or state has an object of numbers
function copy_stats(stats) {
  let num   = x => x === null || is_num(x) ? x : undefined
  let total = k => /^(seconds|energy_joules|energy_wh)$/.test(k)

  return copy_entries(stats, 100, (k, v) => {
    if (total(k)) return is_num(v) ? v : undefined
    return is_obj(v) ? copy_entries(v, 100, (k, x) => num(x)) : num(v)
  })
}


function copy_unit(u) {
  let label = x => x == null || is_text(x) || is_num(x)
  let keys  = ['number', 'project', 'group', 'result']

  if (!(is_obj(u) && is_text(u.id) && is_time(u.start) &&
        (u.end == null || is_time(u.end)) && is_list(u.runs) &&
        u.runs.every(r => is_tuple(r, 2, is_time)) &&
        keys.every(k => label(u[k])))) return

  let c = {id: u.id, start: u.start, end: u.end == null ? null : u.end,
           runs: u.runs.map(([t0, t1]) => [t0, t1])}
  for (let k of keys) if (u[k] !== undefined) c[k] = u[k]
  return c
}


// A gpu_history value is null or has the shape the client sends: full rows
// in ascending order, from before to and no wider than it clamps a range.
// Returns a plain copy of the parts the page uses, undefined if malformed,
// false if it has more units or runs than the page draws.
function gpu_history_value(v) {
  if (v === null) return null
  if (!is_obj(v)) return

  let {from, to, bucket, fields, states, rows, units, stats} = v
  let names = l => is_list(l, 100) && l.every(is_text)

  if (!names(fields) || !names(states) || !is_list(rows) ||
      !Array.isArray(units) || !is_obj(stats)) return
  if (!(is_time(from) && is_time(to) && 1 <= to - from &&
        to - from <= history_span)) return
  if (!(is_num(bucket, history_span) && 0 < bucket)) return
  if (history_max < units.length) return false

  // Counted first, each run is a rectangle in every chart
  let runs = 0
  for (let u of units)
    if (is_obj(u) && Array.isArray(u.runs)) runs += u.runs.length
  if (history_runs < runs) return false

  let sets = {}
  for (let k of ['all', 'active'])
    if (stats[k] !== undefined && !(sets[k] = copy_stats(stats[k]))) return

  let value = c => c === null || is_tuple(c, 3)
  let state = c => c === null || is_num(c) || is_text(c)
  let n = fields.length, last = -Infinity

  for (let row of rows) {
    if (!Array.isArray(row) || row.length != 2 + n + states.length ||
        !is_time(row[0]) || row[0] <= last ||
        !is_num(row[1], history_span)) return
    if (!row.slice(2, 2 + n).every(value) || !row.slice(2 + n).every(state))
      return
    last = row[0]
  }

  let copies = units.map(copy_unit)
  if (copies.some(u => !u)) return

  return {
    from, to, bucket, fields: fields.slice(), states: states.slice(),
    rows: rows.map(row =>
      row.map(c => Array.isArray(c) ? [c[0], c[1], c[2]] : c)),
    units: copies, incomplete: !!v.incomplete, stats: sets
  }
}


class Machine {
  constructor(id, ctx) {
    this.ctx   = ctx
    this.aid   = ctx.$account.data.id
    this.cache = ctx.$cache
    this.util  = ctx.$util
    this.state = reactive({
      id,
      name:      id,
      connected: false,
      last_connected: 0,
      data:      {}
    })
  }


  get_id()      {return this.state.id}
  get_name()    {return this.state.name}
  get_data()    {return this.state.data}
  get_viz(unit) {return (this.get_data().viz || {})[unit] || {}}
  get_url(path) {return this.get_id() + path}
  get_info()    {return this.get_data().info || {}}
  get_version() {return this.get_info().version}
  get_os()      {return this.get_info().os}
  get_groups()  {return Object.keys(this.get_data().groups || {'': null})}
  get_group(name = '') {return (this.get_data().groups || {})[name] || {}}


  get_title() {
    if (this.is_direct()) return 'Direct client at ' + this.conn.address
    return 'F@H ID ' + this.get_id()
  }


  // A GPU id is one path segment, ':' is allowed in it
  get_gpu_history_url(gpu) {
    let id = encodeURIComponent(gpu).replace(/%3A/gi, ':')
    return '/' + this.get_url('/gpu-history/' + id)
  }


  get_config(group) {
    if (group == undefined) return this.get_data().config || {}
    return this.get_group(group).config || {}
  }


  get_resources(group = '', max_length) {
    let l = []
    let config = this.get_config(group)

    if (config.cpus) l.push(config.cpus + ' CPUs')

    for (let gpu of this.get_gpus(group))
      l.push(gpu.description)

    let s = l.length ? l.join(', ') : 'No resources'

    if (max_length && max_length < s.length)
      return s.substring(0, max_length - 3) + '...'

    return s
  }


  has_resources(group = '') {
    return this.get_config(group).cpus || this.get_gpus(group).length
  }


  get_conn() {return this.conn}
  set_conn(conn) {this.conn = conn}
  is_direct() {return this.get_conn() && this.get_conn().is_direct()}


  get_units() {
    return (this.get_data().units || []).map(
      unit => new Unit(this.ctx, unit, this))
  }


  is_hidden() {
    if (this.is_direct())
      return !this.is_connected() && !this.ctx.$util.get_direct_address()

    if (this.ctx.$machs == undefined) return false
    return this.get_id() == this.ctx.$machs.get_direct_id()
  }


  set_name(name) {this.state.name = name}


  async save_name(name) {
    this.set_name(name)
    await this.ctx.$api.put('/account/machines/' + this.get_id(), {name})
    this.send_command('restart')
  }


  is_outdated() {
    const latest  = this.ctx.$api.get_latest_version()
    const current = this.get_version()
    return latest && current && this.util.version_less(current, latest)
  }


  is_unsupported() {
    const version = this.get_version()
    return version && this.util.version_less(version, '8.3.0')
  }


  is_unlinked() {
    let aid = this.get_info().account
    let id  = (this.ctx.$adata || {}).id
    return id ? aid != id : !aid
  }


  get_warnings(group = '') {
    if (!this.is_connected()) return []

    let l = []
    let g = this.get_group(group)

    if (this.is_unlinked()) l.push('Machine not linked to F@H account')
    if (g.failed) l.push(g.failed)
    else if (1 < g.failed_wus) l.push('Check log for errors and warnings')

    return l
  }


  is_connected() {return this.state.connected}


  // The client this machine talks to.  Pointing the direct connection at
  // another address changes it at once, its id when the other client first
  // answers.  A reconnect changes neither.
  get_target() {
    let sock = this.is_direct() ? toRaw(this.get_conn().sock) : undefined
    return {id: this.get_id(), sock}
  }


  is_connected_to(target) {
    let now = this.get_target()
    return this.is_connected() && now.id === target.id &&
      now.sock === target.sock
  }


  is_recently_connected() {
    return this.is_connected() ||
      new Date().getTime() < this.state.last_connected + 5 * 60 * 1000
  }


  is_paused(group) {
    if (group != undefined) return this.get_config(group).paused

    for (let group of this.get_groups())
      if (!this.is_paused(group))
        return false

    return true
  }


  is_active() {
    if (!this.is_connected()) return false

    for (let unit of this.get_units())
      if (!unit.paused) return true

    return false
  }


  is_linked() {
    if (!this.is_direct()) return true
    return this.get_info().account == this.aid
  }


  get_gpus(group = '') {
    let info   = this.get_info()
    let config = this.get_config(group)
    let gpus   = []

    if (config.gpus && info.gpus)
      for (let id in config.gpus)
        if (info.gpus[id] && config.gpus[id].enabled)
          gpus.push(info.gpus[id])

    return gpus
  }


  async send_command(cmd, data = {}) {
    data = Object.assign({}, data, {cmd, time: new Date().toISOString()})
    return this.send(data)
  }


  async set_state(state, group) {
    let data = {state}
    if (group != undefined) data.group = group
    return this.send_command('state', data)
  }


  async auto_link() {
    if (!this.is_connected()) return

    // Auto link if not already linked
    let token = this.ctx.$adata.token
    if (!token || this.get_info().account) return

    await this.link(token)

    return this.ctx.$root.message('info', 'Auto-linking client',
      'The local machine has been automatically linked to your ' +
      'Folding@home account.  Its configuration will remain ' +
      'synchronized with the account.')
  }


  async dump(unit)        {return this.send_command('dump',   {unit})}
  async configure(config) {return this.send_command('config', {config})}


  async link(token)       {
    return this.send_command('link', {token, name: this.get_name()})
  }


  async unlink() {
    await this.ctx.$api.delete('/account/machines/' + this.get_id())
    if (this.is_connected()) this.send_command('restart')
  }


  // Only the requested series is kept, the client stores the others
  async request_series(unit) {
    this.seriesUnit = unit
    this._drop_series()
    if (this.is_connected()) return this.send_command('series', {unit})
  }


  clear_series() {
    this.seriesUnit = undefined
    this._drop_series()
  }


  // Kept per key until replaced.  The reply arrives in data.gpu_history[key]
  // with the request's fields and value.  failed is set if it timed out, the
  // value is then kept only if it is for the same tag.  invalid is set, the
  // value kept the same way, if the reply was malformed, with large also set
  // if it was too large to draw.
  request_gpu_history(key, request) {
    if (!this.historyRequests) this.historyRequests = {}
    this.historyID = (this.historyID || 0) + 1
    this.historyRequests[key] =
      Object.assign({}, request, {id: this.historyID, sent: false})
    this._send_gpu_history()
  }


  clear_gpu_history(key) {
    delete (this.historyRequests || {})[key]
    delete (this.get_data().gpu_history || {})[key]
  }


  visualize_unit(unit) {
    if (this.vizUnit == unit) return
    this.vizUnit = unit
    this._send_viz_enable()
  }


  log_enable(enable) {
    if (this.logEnabled == enable) return
    console.debug(this.get_name() + ': log ' +
      (enable ? 'enabled' : 'disabled'))
    this.logEnabled = enable
    this._send_log_enable()
  }


  wus_enable(enable) {
    if (this.wusEnabled == enable) return
    this.wusEnabled = enable
    this._send_wus_enable()
  }


  async send(msg) {
    console.debug(this.get_name(), msg)
    return this.get_conn().send(msg)
  }


  on_open()  {this.first = true}


  on_close() {
    this._end_gpu_history()
    this.state.connected = false
    this.state.last_connected = new Date().getTime()
  }


  close()    {if (this.get_conn()) this.get_conn().close()}


  async on_message(msg) {
    console.debug(this.get_name() + ':', msg)

    if (this.first) {
      this.first = false
      this.state.connected = true
      this.state.data = new Updatable(msg)

      if (this.vizUnit)    this._send_viz_enable()
      if (this.logEnabled) this._send_log_enable()
      if (this.wusEnabled) this._send_wus_enable()
      if (this.seriesUnit) this.request_series(this.seriesUnit)
      this._resend_gpu_history()

    } else if (Array.isArray(msg)) {
      // Never a path update, the fourth element echoes the request id
      if (msg[0] == 'gpu_history')
        return msg.length == 4 && this._on_gpu_history(msg[3], msg[2])

      // Late reply for a series no longer requested
      if (msg[0] == 'series' && msg[1] != this.seriesUnit) return

      this.state.data.do_update(msg)

      // A null value deletes the key but here means no history was recorded
      if (msg.length == 3 && msg[0] == 'series' && msg[2] === null)
        this.state.data.series[msg[1]] = null

      // Cache viz
      if (msg.length && msg[0] == 'viz') {
        let key   = msg.slice(0, -1).join('/')
        let value = msg.slice(-1)[0]
        await this.cache.set(key, value)
      }

      // Trim log
      let log = this.state.data.log || []
      const maxLog = 1e5
      if (maxLog < log.length) {
        log.splice(0, log.length - maxLog)
        log.splice(0, log.length / 3) // Drop a 3rd so the log stops shifting
      }
    }
  }


  async _viz_get_frames(unit) {
    const data = this.get_data()
    if (!data.viz) data.viz = {}

    // First try to load from cache
    let viz = this.get_viz(unit)

    if (!viz.topology) {
      let key = 'viz/' + unit + '/topology'
      viz.topology = await this.cache.get(key, 0)
    }

    if (!viz.frames) viz.frames = []

    if (viz.topology) {
      for (let i = 0; i < 1000; i++) {
        if (viz.frames[i]) break
        let key = 'viz/' + unit + '/frames/' + i
        let frame = await this.cache.get(key, 0)
        if (!frame) break
        viz.frames[i] = frame
      }

      data.viz[unit] = viz
    }

    return viz.frames.length
  }


  _drop_series() {
    let series = this.get_data().series || {}
    for (let unit of Object.keys(series))
      if (unit != this.seriesUnit) delete series[unit]
  }


  // One request at a time keeps the client's load low.  Requests replaced
  // meanwhile are never sent.
  _send_gpu_history() {
    if (!this.is_connected() || this.historySent) return

    for (let request of Object.values(this.historyRequests || {}))
      if (!request.sent) {
        let {gpu, from, to, points, id} = request
        request.sent = true
        this.historySent = id
        this.historyTimer =
          setTimeout(() => this._on_gpu_history_timeout(id), 30 * 1000)
        return this.send_command('gpu_history', {gpu, from, to, points, id})
      }
  }


  _end_gpu_history() {
    clearTimeout(this.historyTimer)
    this.historySent = undefined
  }


  _resend_gpu_history() {
    this._end_gpu_history()
    for (let request of Object.values(this.historyRequests || {}))
      request.sent = false
    this._send_gpu_history()
  }


  // The key of the current request with this id, if any
  _gpu_history_key(id) {
    let requests = this.historyRequests || {}
    return Object.keys(requests).find(key => requests[key].id === id)
  }


  _set_gpu_history(key, result) {
    let data = this.get_data()
    if (!data.gpu_history) data.gpu_history = {}
    let {gpu, from, to, tag} = this.historyRequests[key]
    data.gpu_history[key] = Object.assign({gpu, from, to, tag}, result)
  }


  // An earlier reply for the same selection stays
  _kept_gpu_history(key) {
    let old = (this.get_data().gpu_history || {})[key]
    if (old && old.tag === this.historyRequests[key].tag) return old.value
  }


  // Replies to replaced or cleared requests are dropped.  A reply after the
  // timeout still fills its request if that is current.  A malformed or too
  // large value is dropped and invalid set instead, a valid one is stored as
  // a copy.
  _on_gpu_history(id, reply) {
    let key = this._gpu_history_key(id)
    if (key) {
      let value = gpu_history_value(reply)
      if (value === undefined || value === false)
        this._set_gpu_history(key, {invalid: true, large: value === false,
                                    value: this._kept_gpu_history(key)})
      else this._set_gpu_history(key, {value})
    }

    if (this.historySent === id) {
      this._end_gpu_history()
      this._send_gpu_history()
    }
  }


  _on_gpu_history_timeout(id) {
    if (this.historySent !== id) return

    let key = this._gpu_history_key(id)
    if (key)
      this._set_gpu_history(key,
                            {failed: true, value: this._kept_gpu_history(key)})

    this._end_gpu_history()
    this._send_gpu_history()
  }


  dup_state(mach) {
    this.visualize_unit(mach.vizUnit)
    this.log_enable(mach.logEnabled)
    this.wus_enable(mach.wusEnabled)
  }


  async _send_viz_enable() {
    if (!this.is_connected()) return
    const unit  = this.vizUnit
    const frame = await this._viz_get_frames(unit)
    this.send_command('viz', {unit, frame})
  }


  _send_log_enable() {
    if (this.is_connected()) this.send_command('log', {enable: this.logEnabled})
  }

  _send_wus_enable() {
    if (this.is_connected()) this.send_command('wus', {enable: this.wusEnabled})
  }

}

export default Machine
