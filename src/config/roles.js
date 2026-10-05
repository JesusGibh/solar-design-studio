// Niveles de acceso. El rol de cada usuario se define en datos/usuarios.csv (columna "rol").
// Todos ven las propuestas de todos; editar una solo puede quien la creó (los demás la copian).
//   secciones: a cuáles entra (null = todas) · elegirMarca: puede cotizar con cualquier marca
//   equipos: edita, desactiva y elimina fichas · nube: administra la conexión con Google Sheets
//   eliminarAjenas: puede borrar propuestas de otros usuarios
export const ROLES = {
  admin: { label: 'Administrador', secciones: null, elegirMarca: true, equipos: true, nube: true, eliminarAjenas: true },
  ingeniero: { label: 'Ingeniero', secciones: ['consumo', 'diseno', 'propuesta', 'historial'], elegirMarca: false, equipos: false, nube: false, eliminarAjenas: false },
}

export const getRol = (id) => ROLES[id] ?? ROLES.ingeniero
