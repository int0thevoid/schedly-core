/**
 * Modalidad con que se guarda una cita. Si el servicio es solo online o solo presencial, manda el
 * servicio: antes la cita manual del panel partía siempre en "Presencial" y una cita de un servicio
 * online quedaba como presencial (sin link de Meet y con la dirección de la consulta).
 * Solo los servicios "both" respetan lo elegido.
 */
export function resolveModality(serviceModality: string, requested: string): string {
  return serviceModality === 'online' || serviceModality === 'presential' ? serviceModality : requested
}
