/*
 * SYNTHETIC ONLY — Tokfai P1240-R2.
 * IMU sample stub feeding attitude error / rate (not wired in this fixture).
 */

void imu_input_sample(float attitude_error[3], float angular_rate[3])
{
    attitude_error[0] = 0.0f;
    attitude_error[1] = 0.0f;
    attitude_error[2] = 0.0f;
    angular_rate[0] = 0.0f;
    angular_rate[1] = 0.0f;
    angular_rate[2] = 0.0f;
}
