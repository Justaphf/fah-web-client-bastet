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
  86400]

const min_buckets = 3


function coord(v) {return Math.round(v * 10) / 10}


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


// Sub-minute steps only when fine, their longer labels allow fewer ticks
function ticks([x0, x1], fine) {
  let steps = fine ? time_steps : time_steps.filter(step => 60 <= step)
  let span  = x1 - x0
  let step  = steps.find(step => span / step <= (step < 60 ? 4 : 6)) || 86400
  let ticks = []

  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) {
    let pos = (t - x0) / (x1 - x0) * 100
    if (3 < pos && pos < 97) ticks.push({t, pos, step})
  }

  return ticks
}


function line(segments, bucket, x, y) {
  let d = []

  for (let s of segments) {
    let pts = s.map(p => [x(p.t + bucket / 2), y(p.mean)])

    // A lone bucket is drawn across its width
    if (pts.length == 1)
      pts = [[x(s[0].t), pts[0][1]], [x(s[0].t + bucket), pts[0][1]]]

    d.push('M' + pts.map(p => p.map(coord).join(',')).join('L'))
  }

  return d.join('')
}


function band(segments, bucket, x, y) {
  let d = []

  for (let s of segments) {
    let xs = s.map(p => x(p.t + bucket / 2))
    if (s.length == 1) xs = [x(s[0].t), x(s[0].t + bucket)]

    let pts = s.length == 1 ? [s[0], s[0]] : s
    let top = pts.map((p, i) => [xs[i], y(p.max)])
    let bot = pts.map((p, i) => [xs[i], y(p.min)]).reverse()

    d.push('M' + top.concat(bot).map(p => p.map(coord).join(','))
      .join('L') + 'Z')
  }

  return d.join('')
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


function series_window(selected, series) {
  return clamp(selected, range(series), min_span(series))
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


export default {
  range, points, segments, visible, ticks, line, band, min_span,
  window: series_window, drag_mode, drag, center
}
