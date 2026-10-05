// Perfiles de los autores que firman las propuestas. La clave es el valor guardado en el proyecto.
export const AUTHORS = {
  'jesus-ariza': {
    nombre: 'JESUS ARIZA',
    cargo: 'COORDINADOR DE INGENIERIA',
    email: 'jariza@solar5estrellas.com',
    telefono: '(+507) 6693-4522 / 6484-4822',
    web: 'www.solar5estrellas.com',
    instagram: '@solar5estrellas',
  },
  'johnny-velandia': {
    nombre: 'JOHNNY ANDRES VELANDIA CUERVO',
    cargo: 'PROJECT MANAGER',
    email: 'jvelandia@solar5estrellas.com',
    telefono: '(+507) 6620-0280',
    web: 'www.solar5estrellas.com',
    instagram: '@solar5estrellas',
  },
}

export const AUTHOR_POR_DEFECTO = 'jesus-ariza'
export const getAuthor = (id) => AUTHORS[id] ?? AUTHORS[AUTHOR_POR_DEFECTO]
