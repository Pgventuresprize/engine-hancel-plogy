/**
 * El marco de todo lo que pasa antes de entrar: login, registro, recuperar la
 * contraseña, elegir una nueva y crear la primera empresa.
 *
 * Es un grupo de rutas, asi que no cambia ninguna URL (`/login` sigue siendo
 * `/login`): solo comparten el fondo liquido y la tarjeta de vidrio del brand
 * kit, que antes vivian dentro de la pagina de login.
 */
export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="plogy-liquid flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="plogy-glass w-full max-w-md p-8 md:p-10">{children}</div>
    </div>
  )
}
