<!--

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2024, foldingathome.org
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
  props: ['gpu', 'id'],


  computed: {
    devs() {
      let devs = []

      for (const name of ['OpenCL', 'CUDA', 'HIP']) {
        let type  = name.toLowerCase()
        let cinfo = Object.assign({}, this.gpu[type] || {})

        cinfo.name      = name
        cinfo.supported = cinfo.compute
        cinfo.image     = `/images/${cinfo.supported ? '' : 'no-'}${type}.png`

        devs.push(cinfo)
      }

      return devs
    }
  }
}
</script>

<template lang="pug">
fieldset.view-panel.gpu-fieldset
  legend {{id}}
  .info-group
    info-item(label="Description", :content="gpu.description")
    info-item(label="Vendor",      :content="gpu.type")

  .info-group
    info-item(label="Supported", :content="gpu.supported", bool)
    info-item(label="UUID",      :content="gpu.uuid")

  .info-group
    info-item(label="PCI Device ID", :content="'0x' + gpu.device.toString(16)")
    info-item(label="PCI Vendor ID", :content="'0x' + gpu.vendor.toString(16)")

  .info-group(v-if="gpu.nvml")
    info-item(label="PCIe Link (Max)", :content="gpu.pcie_link_system + '(' + gpu.pcie_link_device + ')'")
    info-item(label="PCIe Link (Current)", :content="gpu.pcie_link_system")

  .info-group(v-if="gpu.nvml")
    info-item(label="GPU Clock (MHz)", :content="gpu.cur_gpu_clock.toString(10)+'/'+gpu.max_gpu_clock.toString(10)")
    info-item(label="Mem Clock (MHz)", :content="gpu.max_mem_clock.toString(10)+'/'+gpu.max_mem_clock.toString(10)")

  .info-group(v-if="gpu.nvml")
    info-item(label="PState", :content="gpu.pstate")
    info-item(label="GPU Temp (C)", :content="gpu.cur_temp")

  .info-group(v-if="gpu.nvml")
    info-item(label="Power (Current)", :content="gpu.cur_gpu_power")
    info-item(label="Power (Limit)", :content="gpu.max_gpu_power")

  .info-group(v-if="gpu.nvml")
    info-item(label="Fans", :content="gpu.gpu_fans")
    info-item(v-if="gpu.gpu_fans > 0", label="Fan (%)", :content="gpu.cur_fan_pct")

  .info-group(v-if="gpu.nvml && gpu.gpu_fans > 0")
    info-item(label="Fan 1 (%)", :content="gpu.fan0_pct")
    info-item(label="Fan 2 (%)", :content="gpu.fan1_pct")

  .info-group(v-if="gpu.nvml && gpu_fans > 2")
    info-item(label="Fan 3 (%)", :content="gpu.fan2_pct")

  .info-group(v-for="dev of devs")
    info-item(:label="dev.name",
      :content="(dev.supported ? '' : 'un') + 'supported'")

    template(v-if="dev.compute")
      info-item(label="Compute", :content="dev.compute")
      info-item(label="Driver",  :content="dev.driver")
</template>

<style lang="stylus">
</style>
