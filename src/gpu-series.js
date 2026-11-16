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

const time_steps = [
  10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200,
  86400, 172800, 604800]

const min_buckets = 3
const hour        = 3600
const day         = 24 * hour

// GPU history windows, ending now
const presets = [
  {key: '6h',  name: '6 hours',  span: 6 * hour},
  {key: '24h', name: '24 hours', span: day},
  {key: '7d',  name: '7 days',   span: 7 * day},
  {key: '30d', name: '30 days',  span: 30 * day},
]


function coord(v) {return Math.round(v * 10) / 10}


// Path data, without segments whose coordinates are not finite
function path(segments, close = '') {
  return segments.filter(pts => pts.flat().every(isFinite))
    .map(pts => 'M' + pts.map(p => p.map(coord).join(',')).join('L') + close)
    .join('')
}


function range(series) {
  let rows = series.rows || []
  if (!rows.length) return [0, 1]
  return [rows[0][0], rows[rows.length - 1][0] + series.bucket]
}


function points(series, field) {
  let col = 2 + series.fields.indexOf(field)

  return (series.rows || []).map(row => {
    let p = {t: row[0], seconds: row[1]}
    let v = row[col]
    if (1 < col && Array.isArray(v))
      Object.assign(p, {min: v[0], max: v[1], mean: v[2]})
    return p
  })
}


// Missing buckets and buckets without this field break the line
function segments(points, bucket) {
  let segments = []
  let segment, last

  for (let p of points) {
    if (p.mean == undefined) {segment = undefined; continue}

    if (!segment || bucket < p.t - last.t)
      segments.push(segment = [])

    segment.push(p)
    last = p
  }

  return segments
}


// Buckets overlapping the range, optionally with one neighbour on each side
function visible(points, bucket, range, neighbours) {
  if (!range) return points

  let [t0, t1] = range
  let i = 0, j = points.length
  while (i < j && points[i].t + bucket <= t0) i++
  while (i < j && t1 <= points[j - 1].t) j--

  if (neighbours) {
    i = Math.max(0, i - 1)
    j = Math.min(points.length, j + 1)
  }

  return points.slice(i, j)
}


// Sub-minute steps only when fine, their longer labels allow fewer ticks.
// Longer windows double the last step, so there are a few ticks at most.
function ticks([x0, x1], fine) {
  let steps = fine ? time_steps : time_steps.filter(step => 60 <= step)
  let span  = x1 - x0
  let ticks = []
  if (!(isFinite(span) && 0 < span)) return ticks

  let step = steps.find(step => span / step <= (step < 60 ? 4 : 6)) ||
    steps[steps.length - 1]
  while (6 < span / step) step *= 2

  let first = Math.ceil(x0 / step)
  for (let i = 0; i < 8; i++) {
    let t = (first + i) * step
    if (x1 < t) break
    let pos = (t - x0) / span * 100
    if (3 < pos && pos < 97) ticks.push({t, pos, step, span})
  }

  return ticks
}


// From a UTC time text.  Seconds only for sub-minute steps, the date for day
// steps and at midnight in windows longer than a day.
function tick_label(text, {t, step, span}) {
  if (day <= step || (day < span && t % day == 0)) return text.substring(5, 10)
  return text.substring(11, step < 60 ? 19 : 16)
}


// The shortest multiple of base, at least length long, which divides a day
function day_bucket(length, base = 1) {
  let first = Math.max(Math.ceil(length / base), 1) * base

  for (let b = first; b <= day; b += base)
    if (day % b == 0) return b

  return first
}


function line(segments, bucket, x, y) {
  return path(segments.map(s => {
    let pts = s.map(p => [x(p.t + bucket / 2), y(p.mean)])

    // A lone bucket is drawn across its width
    if (pts.length == 1)
      pts = [[x(s[0].t), pts[0][1]], [x(s[0].t + bucket), pts[0][1]]]

    return pts
  }))
}


function band(segments, bucket, x, y) {
  return path(segments.map(s => {
    let xs = s.map(p => x(p.t + bucket / 2))
    if (s.length == 1) xs = [x(s[0].t), x(s[0].t + bucket)]

    let pts = s.length == 1 ? [s[0], s[0]] : s
    let top = pts.map((p, i) => [xs[i], y(p.max)])
    let bot = pts.map((p, i) => [xs[i], y(p.min)]).reverse()

    return top.concat(bot)
  }), 'Z')
}


function min_span(series) {return min_buckets * series.bucket}


// Inside full and at least min long, null when it covers all of full
function clamp(range, full, min) {
  if (!range) return null

  let [lo, hi] = full
  let span = Math.max(range[1] - range[0], min)
  if (hi - lo <= span) return null

  let t0 = Math.min(Math.max(range[0], lo), hi - span)
  return [t0, t0 + span]
}


function series_window(selected, series, full = range(series)) {
  return clamp(selected, full, min_span(series))
}


// What a press at pixel x does, x0 and x1 are the window edges
function drag_mode(x, x0, x1, grab, zoomed) {
  let inside = x0 <= x && x <= x1
  let d0 = Math.abs(x - x0), d1 = Math.abs(x - x1)

  if (inside && x1 - x0 < 3 * grab) return 'move'
  if (Math.min(d0, d1) <= grab) return d0 < d1 ? 'start' : 'end'
  return inside && zoomed ? 'move' : 'select'
}


// The window after dragging from time t to u
function drag(mode, range, t, u, full, min) {
  let [lo, hi] = full
  let [t0, t1] = range
  let d = u - t

  if (mode == 'start') t0 = Math.max(lo, Math.min(t0 + d, t1 - min))
  else if (mode == 'end') t1 = Math.min(hi, Math.max(t1 + d, t0 + min))
  else if (mode == 'move') {t0 += d; t1 += d}
  else {
    t = Math.min(Math.max(t, lo), hi)
    u = Math.min(Math.max(u, lo), hi)
    if (u < t) {t0 = Math.min(u, t - min); t1 = t}
    else {t0 = t; t1 = Math.max(u, t + min)}
  }

  return clamp([t0, t1], full, min)
}


function center(range, t, full, min) {
  let span = range[1] - range[0]
  return clamp([t - span / 2, t + span / 2], full, min)
}


// The stretches of [t0, t1] outside the runs.  Runs have the resolution of
// the bucket, so shorter stretches at the ends are not counted.
function gaps(runs, t0, t1, bucket) {
  let l = []
  let t = t0, first = true

  for (let [r0, r1] of runs.slice().sort((a, b) => a[0] - b[0])) {
    r0 = Math.max(r0, t0)
    r1 = Math.min(r1, t1)
    if (r1 <= r0) continue

    if (first ? bucket < r0 - t : t < r0) l.push([t, r0])
    t = Math.max(t, r1)
    first = false
  }

  if (first ? t0 < t1 : bucket < t1 - t) l.push([t, t1])

  return l
}


// The seconds of history kept for History Days
function retention(days) {
  return Number.isInteger(days) && 0 < days ? days * day : Infinity
}


// The GPU history query for a Work Unit recorded from t0 to t1: the shortest
// window reaching back to t0 and, once it has ended, zoomed to it with a
// margin.  The longest window and no zoom if none reaches back to t0.
function unit_query([t0, t1], open, bucket, kept, now) {
  let preset = presets.find(p => now - Math.min(p.span, kept) <= t0)
  if (!preset) return {span: presets[presets.length - 1].key}

  let query = {span: preset.key}
  let margin = Math.max((t1 - t0) / 10, bucket)
  if (!open && t0 < t1 && isFinite(margin))
    query.zoom = Math.floor(t0 - margin) + '-' + Math.ceil(t1 + margin)

  return query
}


export default {
  presets, range, points, segments, visible, ticks, line, band, min_span,
  window: series_window, drag_mode, drag, center, gaps, tick_label, day_bucket,
  retention, unit_query
}
