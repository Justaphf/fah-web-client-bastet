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

import {toRaw} from 'vue'
import fields  from './unit_fields.json'


const status = {
  'ASSIGN':   'Assigning',
  'DOWNLOAD': 'Downloading',
  'CORE':     'Core',
  'RUN':      'Running',
  'FINISH':   'Finishing',
  'UPLOAD':   'Uploading',
  'CLEAN':    'Ended',
  'WAIT':     'Waiting',
  'PAUSE':    'Paused',
  'DUMP':     'Dumping',

  'DUMPED':   'Dumped',
  'EXPIRED':  'Expired',
  'ABORTED':  'Aborted',
  'MISSING':  'Missing Data',
  'RETRIES':  'Max Retries',
  'FAILED':   'Failed',
  'REJECTED': 'Rejected',
  'CREDITED': 'Credited',
}


const wait_status = {
  'ASSIGN':   'Assign Wait',
  'DOWNLOAD': 'Download Wait',
  'CORE':     'Core Wait',
  'RUN':      'Run Wait',
  'UPLOAD':   'Upload Wait',
  'DUMP':     'Dump Wait',
}

const icons = {
  'ASSIGN':   'download',
  'DOWNLOAD': 'download',
  'CORE':     'download',
  'RUN':      'refresh',
  'FINISH':   'flag-checkered',
  'UPLOAD':   'upload',
  'CLEAN':    'check', // Deprecated
  'WAIT':     'clock-o',
  'PAUSE':    'hourglass-o',

  'DUMPED':   'trash',
  'EXPIRED':  'calendar-times-o',
  'CREDITED': 'star',
}


const wait_icons = {
  'ASSIGN':   'clock-o',
  'DOWNLOAD': 'cloud-download',
  'CORE':     'cogs',
  'RUN':      'refresh',
  'UPLOAD':   'cloud-upload',
  'DUMP':     'trash-o',
}


function clean_field(name) {return name.toLowerCase().replaceAll(' ', '_')}


function to_ms(t) {return new Date(t).getTime()}


// Raw values for sorting fields whose content is formatted
const sort_values = {
  status:      u => u._status_text,
  status_text: u => u._status_text,
  progress:    u => parseFloat(u.progress),
  ppd:         u => u.ppd_raw,
  eta:         u => u.eta_secs,
  tpf:         u => u.tpf_secs,
  os:          u => u.os_title,
  os_text:     u => u.os_title,
  version:     u => u.mach.get_version(),
  deadline:    u => to_ms(u.assign.time) + u.assign.deadline * 1000,
  timeout:     u => to_ms(u.assign.time) + u.assign.timeout * 1000,
  run_time:    u => u.run_time_secs,
  base_credit: u => u.assign.credit,
  assign_time: u => to_ms(u.assign.time),
  gpu_energy:  u => unit_energy(u).wh,
  gpu_cost:    u => unit_energy(u).cost,
  avg_power:   u => gpu_stat(u, 'power', 'mean'),
  avg_load:    u => gpu_stat(u, 'gpu_util', 'mean'),
  avg_clock:   u => gpu_stat(u, 'gpu_clock', 'mean'),
  max_temp:    u => gpu_stat(u, 'temp', 'max'),
}


function is_blank(v) {
  return v == undefined || v === '' || (typeof v == 'number' && !isFinite(v))
}


function get_os_icon(os) {
  switch (os) {
  case 'macosx':              os = 'apple';   break
  case 'win32': case 'win64': os = 'windows'; break
  }
  return `<div class="fa fa-${os}"></div>`
}


function assigned_gpus(unit) {
  let gpus = unit.mach.get_info().gpus || {}
  return (unit.assign.gpus || []).map(id => gpus[id])
}


function first_gpu(unit) {return assigned_gpus(unit)[0]}


// Statistics of the first assigned GPU.  Recorded statistics also exist for
// finished units, so no RUN guard
function gpu_stat(unit, name, key) {
  let id    = (unit.assign.gpus || [])[0]
  let value = ((unit.unit.gpu_stats || {})[id] || {})[name]
  if (key) value = (value || {})[key]
  return is_number(value) ? value : undefined
}


function stats_energy_wh(stats) {
  if (is_number(stats.energy_wh)) return stats.energy_wh
  if (is_number(stats.energy_joules)) return stats.energy_joules / 3600
}


// Undefined unless all values are numbers
function sum_all(values) {
  if (!values.length || !values.every(is_number)) return
  return values.reduce((a, b) => a + b, 0)
}


// Summed over the assigned GPUs, undefined unless every one has energy
function gpu_energy_wh(unit) {
  let stats = unit.unit.gpu_stats || {}
  return sum_all((unit.assign.gpus || [])
    .map(id => stats_energy_wh(stats[id] || {})))
}


// $/kWh, undefined if the machine does not report a rate
function get_energy_rate(mach) {
  let rate = mach.get_config().energy_rate
  if (is_number(rate) && 0 <= rate) return rate
}


function energy_cost(wh, rate) {
  if (wh != undefined && rate != undefined) return wh / 1000 * rate
}


function gpu_cost_usd(unit) {
  return energy_cost(gpu_energy_wh(unit), unit.energy_rate)
}


// Live while the unit runs, otherwise from history.  Live cost has a fourth
// decimal so that it visibly changes with the live energy.
function unit_energy(unit) {
  let wh = unit.live_energy_wh
  let live = wh != undefined
  if (!live) wh = gpu_energy_wh(unit)

  return {wh, cost: energy_cost(wh, unit.energy_rate), digits: live ? 4 : 3}
}


function dollars(value, digits) {
  return value == undefined ? '' : `$${value.toFixed(digits)}`
}


function coverage_note(units, included) {
  let finished = 0, count = 0

  for (let unit of units)
    if (unit.unit.result) {
      finished++
      if (included(unit)) count++
    }

  return count < finished ? `(${count} of ${finished} units)` : ''
}


function fixed(value, digits) {
  return value == undefined ? '' : value.toFixed(digits)
}


function watt_hours(value) {
  return value == undefined ? '' : value.toLocaleString(undefined,
    {minimumFractionDigits: 2, maximumFractionDigits: 2})
}


// units is '' or starts with a space
function with_max(value, max, units) {
  let absent = v => v == undefined || v === ''
  if (absent(max)) return absent(value) ? '' : `${value}${units}`
  if (absent(value)) return `max ${max}${units}`
  return `${value} / ${max}${units}`
}


function pcie_link(gen, width, device) {
  let parts = []
  if (gen != undefined)    parts.push(`Gen${gen}`)
  if (width != undefined)  parts.push(`x${width}`)
  if (device != undefined) parts.push(`(device Gen${device})`)
  return parts.join(' ')
}


const gpu_stat_fields = {
  gpu_clock: {label: 'Clock',     units: 'MHz'},
  mem_clock: {label: 'Mem Clock', units: 'MHz'},
  power:     {label: 'Power',     units: 'W'},
  temp:      {label: 'Temp',      units: '\u00b0C'},
  gpu_util:  {label: 'Load',      units: '%'},
  mem_util:  {label: 'Mem Load',  units: '%'},
}


const gpu_stat_states = {
  pstate:     {label: 'P-State',    format: s => `P${s}`},
  pcie_gen:   {label: 'PCIe Gen',   format: s => `Gen${s}`},
  pcie_width: {label: 'PCIe Width', format: s => `x${s}`},
}


function gpu_stat_order(name) {
  let i = Object.keys(gpu_stat_fields).indexOf(name)
  if (i != -1) return i
  return /^fan\d+$/.test(name) ? 100 : 200
}


function cmp_gpu_stat_fields(a, b) {
  return gpu_stat_order(a) - gpu_stat_order(b) ||
    a.localeCompare(b, undefined, {numeric: true})
}


const gpu_stat_aggregates = {
  min: 'Min', max: 'Max', mean: 'Mean', median: 'Median', p95: 'P95'}


// Stepped fields have no aggregates
function is_gpu_stat_field(name) {
  return Object.hasOwn(gpu_stat_fields, name) || /^fan\d+$/.test(name)
}


// Per Work Unit totals, listed before the field statistics.  They do not
// wait for the first save.
const gpu_stat_totals = {
  energy: {
    header: 'Energy (Wh)',
    desc:   'Energy used by all GPUs assigned to the Work Unit: live while ' +
      'it runs, from the saved statistics afterwards',
    value:  unit => unit_energy(unit).wh,
    format: watt_hours,
    live:   true,
  },
  cost: {
    header: 'Cost',
    desc:   'Estimated cost of the energy used by all GPUs assigned to the ' +
      'Work Unit at the machine\'s energy rate: live while it runs, from ' +
      'the saved statistics afterwards',
    value:  unit => unit_energy(unit).cost,
    format: (v, unit) => dollars(v, unit_energy(unit).digits),
    live:   true,
  },
  run_time: {
    header: 'Run Time',
    desc:   'Total Work Unit run time',
    value:  unit => unit.run_time_secs,
    format: (v, unit) => v == undefined ? '' : unit.util.time_interval_full(v),
  },
}


const default_gpu_columns    = ['energy', 'gpu_clock.mean', 'power.mean']
const gpu_stat_column_fields = [...Object.keys(gpu_stat_fields), 'fan0', 'fan1']


// Columns named "stat:<total>" or "stat:<field>.<aggregate>"
function parse_stat_column(name) {
  let m = /^stat:(\w+)(?:\.(\w+))?$/.exec(name)
  if (!m) return

  let [, field, agg] = m
  if (!agg) return Object.hasOwn(gpu_stat_totals, field) ?
    {key: field, total: gpu_stat_totals[field]} : undefined

  if (is_gpu_stat_field(field) && Object.hasOwn(gpu_stat_aggregates, agg))
    return {key: `${field}.${agg}`, field, agg}
}


function stat_column_field(name) {
  let c = parse_stat_column(name)
  if (!c) return
  if (c.total)
    return {header: c.total.header, desc: c.total.desc, live: c.total.live}

  let {label, units} = Unit.gpu_field(c.field)
  let agg = gpu_stat_aggregates[c.agg]
  return {header: `${label} ${agg} (${units})`,
          desc: `${label} ${agg.toLowerCase()} of the first assigned GPU ` +
            'over the Work Unit'}
}


function stat_column_value(unit, c) {
  return c.total ? c.total.value(unit) : gpu_stat(unit, c.field, c.agg)
}


function stat_column_pending(unit, c) {
  return unit.gpu_stats_pending && !c.total
}


function stat_column_text(unit, c) {
  let value = stat_column_value(unit, c)
  if (c.total) return c.total.format(value, unit)
  return fixed(value, c.agg == 'mean' ? 1 : 0)
}


function is_number(v) {return typeof v == 'number' && isFinite(v)}


class Unit {
  constructor(ctx, unit, mach) {
    // ctx may be a reactive proxy, which would unwrap $refresh here and make
    // whatever creates this Unit, eg a whole unit list, recalculate every second
    ctx = toRaw(ctx)

    this.$refresh = ctx.$refresh
    this.util     = ctx.$util
    this.api      = ctx.$api
    this.unit     = unit
    this.mach     = mach
  }

  get id()          {return this.unit.id}
  get machine()     {return this.mach.get_name()}
  get group()       {return this.unit.group}
  get is_group()    {return false}
  get row_class()   {return ''}
  get group_name()  {return this.group || 'Default'}
  get assign()      {return this.unit.assignment || {}}
  get number()      {return this.unit.number}
  get core()        {return (this.assign.core || {}).type}
  get project()     {return this.assign.project}
  get run()         {return this.wu.run}
  get clone()       {return this.wu.clone}
  get gen()         {return this.wu.gen}
  get wu()          {return this.unit.wu || {}}
  get type()        {return this.gpus ? 'GPU' : 'CPU'}
  get cpus()        {return this.unit.cpus}
  get gpus()        {return this.unit.gpus.length}
  get os()          {return get_os_icon(this.mach.get_os())}
  get os_text()     {return `${this.os} ${this.os_title} ${this.os_arch}`}
  get os_title()    {return this.mach.get_os() || ''}
  get paused()      {return !!this.unit.pause_reason}
  get work_server() {return this.assign.ws}


  // Absent values format as '' so they can be skipped.  Table cells omit the
  // units, which their column headers show.
  static format_gpu_telemetry(t, units = true) {
    t = t || {}
    let u = s => units ? ' ' + s : ''
    let v = (x, s) => x == undefined ? '' : `${x}${u(s)}`

    return {
      pcie_link:  pcie_link(t.pcie_gen, t.pcie_width),
      pcie_max:   pcie_link(t.pcie_gen_max, t.pcie_width_max,
                            t.pcie_gen_device_max),
      gpu_clock:  with_max(t.gpu_clock, t.gpu_clock_max, u('MHz')),
      mem_clock:  with_max(t.mem_clock, t.mem_clock_max, u('MHz')),
      gpu_pstate: t.pstate == undefined ? '' : `P${t.pstate}`,
      gpu_temp:   v(t.temp, '\u00b0C'),
      gpu_load:   v(t.gpu_util, '%'),
      mem_load:   v(t.mem_util, '%'),
      gpu_power:  with_max(fixed(t.power, 1), fixed(t.power_limit, 0), u('W')),
      gpu_fans:   (t.fans || []).map(speed => `${speed}${u('%')}`).join(' / '),
    }
  }


  // Live telemetry belongs to the unit only while it runs
  get is_running() {return this.unit.state == 'RUN' && !this.paused}


  get_gpu_telemetry(units) {
    let gpu = this.is_running && first_gpu(this)
    return Unit.format_gpu_telemetry((gpu || {}).telemetry, units)
  }


  get gpu_telemetry() {return this.get_gpu_telemetry(false)}


  get pcie_link()   {return this.gpu_telemetry.pcie_link}
  get pcie_max()    {return this.gpu_telemetry.pcie_max}
  get gpu_clock()   {return this.gpu_telemetry.gpu_clock}
  get mem_clock()   {return this.gpu_telemetry.mem_clock}
  get gpu_pstate()  {return this.gpu_telemetry.gpu_pstate}
  get gpu_temp()    {return this.gpu_telemetry.gpu_temp}
  get gpu_load()    {return this.gpu_telemetry.gpu_load}
  get mem_load()    {return this.gpu_telemetry.mem_load}
  get gpu_power()   {return this.gpu_telemetry.gpu_power}
  get gpu_fans()    {return this.gpu_telemetry.gpu_fans}


  // Summed over the assigned GPUs, undefined unless every one reports energy
  get live_energy_wh() {
    if (!this.is_running) return
    return sum_all(assigned_gpus(this)
      .map(gpu => ((gpu || {}).telemetry || {}).energy_wh))
  }


  // The client first saves statistics about five minutes into a run.  Live
  // energy is only reported while it records history.
  get gpu_stats_pending() {
    return !this.unit.gpu_stats && this.live_energy_wh != undefined
  }


  static gpu_field(name) {
    let fan = /^fan(\d+)$/.exec(name)
    if (fan) return {label: `Fan ${+fan[1] + 1}`, units: '%'}
    if (Object.hasOwn(gpu_stat_fields, name)) return gpu_stat_fields[name]
    return {label: name, units: ''}
  }


  static format_stat(v) {
    if (!is_number(v)) return ''
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
  }


  static format_stat_mean(v) {return is_number(v) ? v.toFixed(1) : ''}


  // Rare states stay visible instead of rounding to zero
  static format_fraction(f) {
    if (0 < f && f < 0.0005) return '<0.1 %'
    return (f * 100).toFixed(1) + ' %'
  }


  // Percent of the run time saved with the statistics
  static format_coverage(seconds, run_time) {
    if (!is_number(seconds)) return ''
    let s = `${Math.round(seconds)} s`
    if (!is_number(run_time) || run_time <= 0) return s
    return `${s} (${Math.round(seconds / run_time * 100)} %)`
  }


  static format_gpu_stats(stats, rate) {
    stats = stats || {}
    let is_stat = v => v && typeof v == 'object' && is_number(v.mean)

    let rows = Object.keys(stats).filter(name => is_stat(stats[name]))
      .sort(cmp_gpu_stat_fields)
      .map(name => {
        let s = stats[name]

        return Object.assign({name}, Unit.gpu_field(name), {
          min:    Unit.format_stat(s.min),
          max:    Unit.format_stat(s.max),
          mean:   Unit.format_stat_mean(s.mean),
          median: Unit.format_stat(s.median),
          p95:    Unit.format_stat(s.p95),
        })
      })

    let states = []
    for (const [name, {label, format}] of Object.entries(gpu_stat_states)) {
      let fractions = stats[name]
      if (!fractions || typeof fractions != 'object') continue

      let content = Object.entries(fractions)
        .sort((a, b) => b[1] - a[1])
        .map(([state, f]) => `${format(state)} ${Unit.format_fraction(f)}`)
        .join(', ')

      states.push({name, label, content})
    }

    let wh   = stats_energy_wh(stats)
    let cost = energy_cost(wh, rate)

    return {
      rows, states,
      seconds:  stats.seconds,
      run_time: stats.run_time,
      energy:   wh == undefined ? '' : `${watt_hours(wh)} Wh`,
      cost:     dollars(cost, 3),
    }
  }


  get gpu_stats() {return this.unit.gpu_stats}


  get energy_rate() {return get_energy_rate(this.mach)}


  get gpu_energy() {return watt_hours(unit_energy(this).wh)}


  get gpu_cost() {
    let {cost, digits} = unit_energy(this)
    return dollars(cost, digits)
  }


  get avg_power()  {return fixed(gpu_stat(this, 'power', 'mean'), 1)}
  get avg_load()   {return fixed(gpu_stat(this, 'gpu_util', 'mean'), 1)}
  get avg_clock()  {return fixed(gpu_stat(this, 'gpu_clock', 'mean'), 0)}
  get max_temp()   {return fixed(gpu_stat(this, 'temp', 'max'), 0)}


  // Numeric statistics recorded for the first GPU
  get gpu_stat_names() {
    let id    = (this.assign.gpus || [])[0]
    let stats = (this.unit.gpu_stats || {})[id] || {}

    return Object.keys(stats).filter(name =>
      is_gpu_stat_field(name) && is_number((stats[name] || {}).mean))
  }


  // Sums over the units with GPU energy, blank without any.  Units of
  // machines without an energy rate have no cost.
  static format_gpu_energy_totals(units) {
    let energy, cost

    for (let unit of units) {
      let wh = gpu_energy_wh(unit)
      if (wh == undefined) continue
      energy = (energy || 0) + wh

      let c = energy_cost(wh, unit.energy_rate)
      if (c != undefined) cost = (cost || 0) + c
    }

    return {energy: watt_hours(energy), cost: dollars(cost, 3)}
  }


  // "(n of m units)" when some finished units have no GPU energy
  static format_gpu_energy_coverage(units) {
    return coverage_note(units, unit => gpu_energy_wh(unit) != undefined)
  }


  // As above for units with GPU energy and a machine energy rate
  static format_gpu_cost_coverage(units) {
    return coverage_note(units, unit => gpu_cost_usd(unit) != undefined)
  }


  // Undefined unless key is "<total>" or "<field>.<aggregate>"
  static parse_gpu_stat_key(key) {return parse_stat_column('stat:' + key)}
  static is_gpu_stat_key(key)    {return !!Unit.parse_gpu_stat_key(key)}
  static sort_gpu_stat_fields(names) {return names.sort(cmp_gpu_stat_fields)}


  // Every Work Unit history column, totals first
  static get gpu_stat_keys() {
    let keys = Object.keys(gpu_stat_totals)

    for (let field of gpu_stat_column_fields)
      for (let agg of Object.keys(gpu_stat_aggregates))
        keys.push(`${field}.${agg}`)

    return keys
  }


  static get default_gpu_columns() {return [...default_gpu_columns]}


  // Ordered history columns, invalid keys and duplicates dropped.  Not an
  // array uses the defaults.
  static load_gpu_columns(keys) {
    if (!Array.isArray(keys)) return Unit.default_gpu_columns
    return [...new Set(keys.filter(key => Unit.is_gpu_stat_key(key)))]
  }


  get os_arch() {
    const {cpu} = this.mach.get_info()
    return cpu === 'amd64' ? 'x64' : (cpu || '')
  }


  get version() {
    let version = this.mach.get_version()
    if (!version || !this.mach.is_outdated()) return version

    let url   = this.api.get_download_url()
    let title = 'Client version outdated.  Click to open download page'

    return `<a class="outdated" href="${url}" target="_blank"
      title="${title}"><div class="fa fa-exclamation-triangle"></div></a>
      ${version}`
  }


  get warnings() {
    let l = this.mach.get_warnings(this.group)
    if (!l.length) return ''

    return `<div class="fa fa-exclamation-triangle unit-warning"
      title="${l.join('\n')}"></div>`
  }


  get finish()  {
    return this.unit.state == 'RUN' && this.mach.get_config(this.group).finish
  }


  get gpus_text() {
    let gpus = []
    let info = this.mach.get_info().gpus || {}

    for (let gpu of (this.assign.gpus || []))
      if (gpu in info) gpus.push(info[gpu].description)

    return gpus.length ? gpus.join(' ') : 'none'
  }


  get resources() {
    let cpus = this.cpus
    let gpus = this.gpus_text

    let parts = []
    if (1 < cpus || gpus == 'none') parts.push(`${cpus} CPUs`)
    if (gpus != 'none') parts.push(gpus)

    return parts.join(' ')
  }


  get description() {
    let {project, cpus, gpus_text} = this
    return `project:${project} cpus:${cpus} gpus:${gpus_text}`
  }


  get state() {
    if (this.unit.result) return this.unit.result.toUpperCase()
    if (this.waiting)     return 'WAIT'
    if (this.finish)      return 'FINISH'
    if (this.paused)      return 'PAUSE'
    return this.unit.state
  }

  status_icon(labeled) {
    // Badge wait icons with a clock so waiting is not conveyed by color alone
    let badge = this.state == 'WAIT' && this.icon != 'clock-o'
    let label = this.util.escape_html(this._status_text || this.state || '')
    let a11y = labeled ? `role="img" aria-label="${label}"` :
      'aria-hidden="true"'
    return `<div class="fa fa-${this.icon}${badge ? ' wait-badge' : ''}" ` +
      `${a11y}></div>`
  }


  get status() {return this.status_icon(true)}


  get status_title() {return this._status_text}


  get _status_text() {
    if (this.unit.result) return status[this.state]
    if (this.waiting) return wait_status[this.unit.state] || status[this.state]
    return (this.paused && this.unit.pause_reason) || status[this.state]
  }


  get status_text() {
    return `${this.status_icon(false)} ${this._status_text} ${this.warnings}`
  }


  get icon() {
    if (this.state == 'WAIT')
      return wait_icons[this.unit.state] || icons.WAIT
    return icons[this.state] || 'times'
  }


  get ppd_raw() {return this.unit.ppd || 0}
  get ppd()     {return this.ppd_raw.toLocaleString()}


  get tpf_secs()  {
    let frames   = (this.unit.wu_progress || 0) * 100
    let run_time = this.run_time_secs
    return run_time / frames
  }


  get tpf() {
    return this.tpf_secs ? this.util.time_interval(this.tpf_secs) : '???'
  }


  // Force updates, except on finished WUs
  _refresh() {if (!this.unit.result) this.$refresh.value}


  get deadline() {
    this._refresh()
    return this.util.format_timeout(this.assign.time, this.assign.deadline)
  }


  get timeout()  {
    this._refresh()
    return this.util.format_timeout(this.assign.time, this.assign.timeout)
  }


  get assign_time() {
    this._refresh()
    return this.util.since(this.assign.time) + ' ago'
  }

  get assign_time_title() {return this.util.format_time(this.assign.time)}


  get deadline_secs() {
    return (to_ms(this.assign.time) - Date.now()) / 1000 + this.assign.deadline
  }


  get deadline_time() {
    return this.util.timeout_time(this.assign.time, this.assign.deadline)
  }


  get timeout_time() {
    return this.util.timeout_time(this.assign.time, this.assign.timeout)
  }


  get rcg() {
    if (this.run == undefined) return '?,?,?'
    return `${this.run},${this.clone},${this.gen}`
  }


  get eta_secs() {
    let eta

    if (this.waiting) eta = (this.wait_until - new Date().getTime()) / 1000
    else {
      eta = this.wu_progress < 1 ? this.unit.eta : 0
      if (typeof eta == 'string') eta = this.util.parse_interval(eta)
    }

    return 0 < eta ? eta : 0
  }


  get eta() {
    let eta = this.eta_secs

    if (this.waiting) return this.util.time_interval(eta)

    let s = this.util.time_interval(eta)

    if (this.deadline_secs < eta)
      s = `<div class="eta-warning"
        title="WARNING: May not complete before deadline.">
        <i class="fa fa-exclamation-triangle"></i> ${s}
        <i class="fa fa-exclamation-triangle"></i></div>`

    return s
  }


  get run_time_secs() {
    let t = this.unit.run_time || 0

    if (this.unit.state == 'RUN' && this.unit.start_time != undefined) {
      this.$refresh.value // Force updates while running
      let st = new Date(this.unit.start_time).getTime()
      t += (new Date().getTime() - st) / 1000
    }

    return t
  }


  get run_time() {return this.util.time_interval_full(this.run_time_secs)}


  get cs() {return (this.wu.cs || []).join(', ')}


  get wait_until() {return new Date(this.unit.wait).getTime()}
  get waiting() {
    // Only depend on the util.now timer while actually waiting
    return !this.unit.result && !!this.unit.wait &&
      Date.now() < this.wait_until && this.util.now < this.wait_until
  }


  get wait_progress() {
    if (!this.waiting) return 0
    let remaining = (this.wait_until - this.util.now) / 1000
    let p = 1 - remaining / this.unit.delay
    return this.util.clamp(p, 0, 1)
  }


  get wu_progress() {
    let p = this.unit.wu_progress
    if (p == undefined) p = this.unit.progress || 0
    return this.util.clamp(p, 0, 1)
  }


   get progress() {
    let p = this.unit.progress || 0
    if (this.wu_progress != undefined &&
      (this.paused || ['RUN', 'CLEAN'].includes(this.unit.state) ||
        this.unit.result))
      p = this.wu_progress
    if (this.waiting) p = this.wait_progress
    return this.util.clamp(p * 100, 0, 100).toFixed(1)
  }


  get base_credit() {return (this.assign.credit || 0).toLocaleString()}


  static has_field(name) {return name in fields || !!parse_stat_column(name)}


  // Fields showing a total share its description
  static get_field(name) {
    let field = fields[name]
    if (field && field.total)
      return Object.assign(stat_column_field('stat:' + field.total), field)
    return field || stat_column_field(name) || {}
  }


  static get_field_size(name) {return Unit.get_field(name).size || 'auto'}
  static get field_names()    {return Object.keys(fields)}


  static get default_columns() {
    return Object.entries(fields).filter(e => e[1].enabled).map(e => e[0])
  }


  static get minimal_columns() {
    return Object.entries(fields).filter(e => e[1].minimal).map(e => e[0])
  }


  static get_column_grid_style(cols, append = '') {
    cols = cols.filter(name => Unit.has_field(name))
    let tmpl = cols.map(name => Unit.get_field_size(name)).join(' ')
    return {'grid-template-columns': tmpl + append}
  }


  get_field_content(name) {
    let c = parse_stat_column(name)
    if (!c) return this[clean_field(name)]
    if (stat_column_pending(this, c)) return 'pending'

    return stat_column_text(this, c)
  }


  get_sort_value(name) {
    let c = parse_stat_column(name)
    if (c) return stat_column_value(this, c)

    let f = sort_values[clean_field(name)]
    return f ? f(this) : this.get_field_content(name)
  }


  // dir is 1 for ascending or -1 for descending.  Blanks always sort last.
  static sort(units, field, dir) {
    return units.map(unit => [unit.get_sort_value(field), unit])
      .sort(([a], [b]) => {
        if (is_blank(a) || is_blank(b)) return is_blank(a) - is_blank(b)

        let cmp = typeof a == 'number' && typeof b == 'number' ? a - b :
          String(a).localeCompare(String(b), undefined, {numeric: true})

        return dir * cmp
      })
      .map(e => e[1])
  }
  static get_field_desc(name)   {return Unit.get_field(name).desc}


  // Label and value pairs may need a longer name than the column header
  static get_field_label(name) {
    let {label, header} = Unit.get_field(name)
    return label || header || name
  }


  static get_field_header(name) {
    let {header, units} = Unit.get_field(name)
    header = header || name
    return units ? `${header} (${units})` : header
  }


  // Label and value pairs show the units in the value
  get_field_text(name) {
    let t = this.get_gpu_telemetry(true)
    let key = clean_field(name)
    if (Object.hasOwn(t, key)) return t[key]

    let {units} = Unit.get_field(name)
    let content = this.get_field_content(name)
    return units && content ? `${content} ${units}` : content
  }


  get_field_title(name) {
    let c = parse_stat_column(name)
    if (c && stat_column_pending(this, c))
      return 'Statistics are recorded at the client\'s first save, about ' +
        'five minutes after the core starts'

    if (Unit.get_field(name).live && this.live_energy_wh != undefined &&
        this.get_field_content(name) !== '')
      return 'Live reading while the Work Unit runs'

    return this[clean_field(name) + '_title'] || Unit.get_field_desc(name)
  }


  static get_field_header_class(name) {
    let klass = `unit-${name.toLowerCase().replace(' ', '-')}`
    klass += ` unit-${Unit.get_field(name).align || 'right'}`
    return klass
  }


  get_field_class(name, odd) {
    let klass = Unit.get_field_header_class(name)

    name = clean_field(name)
    if (name == 'status' || name == 'status_text' || name == 'progress')
      klass += ` state-${this.state.toLowerCase()}`

    if (odd != undefined) klass += ` row-${odd ? 'odd' : 'even'}`

    return klass
  }
}

export default Unit
