/*
 * SYNTHETIC ONLY — Tokfai P1240-R2 aviation fixture.
 * Not customer source. Not flightworthy. Not for certification.
 */

#include "control_allocation.h"

/* Forward decls for sibling synthetic modules */
void rotor_law_update(const float attitude_error[3],
                      const float angular_rate[3],
                      float virtual_control[3]);
void actuator_command_write(const float channel_cmd[4]);

/*
 * Attitude-control entry for the synthetic FCU task.
 * Call chain (synthetic):
 *   attitude_control_entry → rotor_law_update → control_allocation
 *                         → actuator_command_write
 */
void attitude_control_entry(const float attitude_error[3],
                            const float angular_rate[3])
{
    float virtual_control[3];
    float actuator_channels[4];

    rotor_law_update(attitude_error, angular_rate, virtual_control);
    control_allocation(virtual_control, actuator_channels);
    actuator_command_write(actuator_channels);
}
