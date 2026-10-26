import { registry } from '../contracts/validate.js';

export function environmentMessage({boot,session,seq,uptime,temperature=-18.4,humidity=55}) {
  return {schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:boot,session_id:session,seq,
    kind:'telemetry',clock_synced:false,sent_at:null,uptime_ms:uptime,payload:{zone_id:'C',controller_revision:0,
      environment:{temperature_c:temperature,humidity_pct:humidity},
      occupancy:{current_occupants:null,count_verified:false,presence:null},
      doors:registry.devices[0].doors.map(door_id=>({door_id,state:'unknown',beam_clear:null,panic_latched:null,local_inputs_healthy:false}))}};
}
export const statusMessage = (message,state) => ({...message,kind:'status',seq:0,payload:{zone_id:'C',state}});
