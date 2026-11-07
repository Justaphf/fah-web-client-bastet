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
import Unit from './unit.js'


export default {
  props: ['unit', 'id', 'name', 'stats'],


  computed: {
    s() {return Unit.format_gpu_stats(this.stats, this.unit.energy_rate)},


    coverage() {
      if (this.s.seconds == undefined) return ''
      return Unit.format_coverage(this.s.seconds, this.s.run_time)
    }
  }
}
</script>

<template lang="pug">
fieldset.view-panel.gpu-stats-fieldset
  legend(:title="id")
    HelpBalloon(:name="`${name} Statistics`"): p.
      Updated when the client saves the unit, about every 5 minutes, and when
      it finishes.  Live readings are in the Work Unit section above.

  .gpu-stats-table(v-if="s.rows.length")
    table.view-table
      thead
        tr
          th Field
          th Min
          th Max
          th Mean
          th Median
          th P95

      tbody
        tr(v-for="row in s.rows", :class="`gpu-stat-${row.name}`")
          td.gpu-stat-field
            | {{row.label}}{{row.units ? ` (${row.units})` : ''}}
          td.gpu-stat-value {{row.min}}
          td.gpu-stat-value {{row.max}}
          td.gpu-stat-value {{row.mean}}
          td.gpu-stat-value {{row.median}}
          td.gpu-stat-value {{row.p95}}

  .gpu-stats-table(v-if="s.states.length")
    table.view-table
      thead
        tr
          th(colspan="2") Time in State

      tbody
        tr(v-for="state in s.states", :class="`gpu-stat-${state.name}`")
          td.gpu-stat-field {{state.label}}
          td.gpu-stat-states {{state.content}}

  .info-group(v-if="coverage || s.energy")
    info-item(label="Coverage", :content="coverage")
    info-item(label="Energy",   :content="s.energy")
    info-item(label="Cost",     :content="s.cost")
</template>

<style lang="stylus">
.gpu-stats-fieldset
  display flex
  flex-direction column
  gap var(--gap)

  .gpu-stats-table
    width 100%
    overflow-x auto

  .view-table
    .gpu-stat-field
      font-family var(--base-font)
      width 1%

    .gpu-stat-value
      text-align right

    .gpu-stat-states
      white-space normal

  // Size to the values so none is cut off
  .info-group .info-item
    flex 1 1 auto

    span
      flex 1 0 auto
      width auto
      min-width max-content
</style>
