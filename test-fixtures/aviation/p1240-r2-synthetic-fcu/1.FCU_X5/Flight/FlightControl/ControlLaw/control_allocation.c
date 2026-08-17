/*
 * SYNTHETIC ONLY — Tokfai P1240-R2.
 * Pseudo mixer / allocation — not a real algorithm.
 */

#include "control_allocation.h"

/*
 * Map virtual_control[3] → actuator channel commands[4]
 * using a fixed placeholder allocation matrix (mixer).
 *
 * Channel mapping (synthetic):
 *   ch0 = +roll +pitch +yaw +collective-proxy
 *   ch1 = -roll +pitch -yaw +collective-proxy
 *   ch2 = +roll -pitch -yaw +collective-proxy
 *   ch3 = -roll -pitch +yaw +collective-proxy
 */
void control_allocation(const float virtual_control[3], float channel_cmd[4])
{
    const float roll = virtual_control[0];
    const float pitch = virtual_control[1];
    const float yaw = virtual_control[2];
    const float collective = 0.25f; /* placeholder bias */

    /* Pseudo allocation matrix rows → actuator channels */
    channel_cmd[0] = +roll + pitch + yaw + collective;
    channel_cmd[1] = -roll + pitch - yaw + collective;
    channel_cmd[2] = +roll - pitch - yaw + collective;
    channel_cmd[3] = -roll - pitch + yaw + collective;
}
