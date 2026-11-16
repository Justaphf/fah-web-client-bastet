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
export default {
  props: ['config', 'gpus'],


  computed: {
    interval_valid() {
      let interval = this.config.gpu_telemetry_interval
      return !this.has('gpu_telemetry_interval') ||
        (Number.isInteger(interval) && 1 <= interval && interval <= 60)
    },


    valid() {
      return this.interval_valid
    }
  },


  methods: {
    has(key) {return key in this.config},


    is_monitored(id) {return !!this.config.gpu_telemetry[id]},


    // Not v-model: unmonitored ids are deleted rather than stored as false
    set_monitored(id, monitored) {
      if (monitored) this.config.gpu_telemetry[id] = true
      else delete this.config.gpu_telemetry[id]
    }
  }
}
</script>

<template lang="pug">
fieldset.settings.view-panel.gpu-telemetry-settings
  legend
    HelpBalloon(name="GPU Telemetry"): p.
      Monitor NVIDIA GPU clocks, temperature, load, power and fan speeds.
      Readings are shown on the machine details page whether or not the GPU
      is folding.

  .setting
    HelpBalloon(name="GPUs"): p.
      Choose which GPUs to monitor.  Only GPUs which can be queried with
      NVIDIA's management library (NVML) are listed.

    table.gpus-input.view-table
      thead
        tr
          th Description
          th ID
          th Monitor

      tbody
        tr.gpu-row(v-for="gpu in gpus", :title="`${gpu.id} ${gpu.description}`")
          td.gpu-description {{gpu.description}}
          td.gpu-id {{gpu.id}}

          td.gpu-enabled
            input(type="checkbox", :checked="is_monitored(gpu.id)",
              @change="set_monitored(gpu.id, $event.target.checked)")

  .setting(v-if="has('gpu_telemetry_interval')")
    HelpBalloon(name="Interval (s)"): p.
      How often monitored GPUs are sampled, in seconds, from 1 to 60.

    input(v-model.number="config.gpu_telemetry_interval", type="number",
      min="1", max="60", step="1", :class="{error: !interval_valid}",
      title="GPU telemetry sampling interval in seconds")
</template>

<style lang="stylus">
.settings-view fieldset
  &.gpu-telemetry-settings .setting > label
    white-space normal

  .gpus-input .gpu-id
    white-space nowrap
</style>
