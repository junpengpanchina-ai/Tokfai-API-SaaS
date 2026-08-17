/*
 * SYNTHETIC ONLY — Tokfai P1240-R2.
 * Not customer header.
 */

#ifndef TOKFAI_P1240_ROTOR_LAW_H
#define TOKFAI_P1240_ROTOR_LAW_H

void rotor_law_update(const float attitude_error[3],
                      const float angular_rate[3],
                      float virtual_control[3]);

#endif
