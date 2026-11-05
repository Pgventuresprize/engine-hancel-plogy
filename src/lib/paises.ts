import "server-only"

import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

/**
 * Los paises del selector de celular y la validacion del numero.
 *
 * Todo corre en el servidor: al navegador solo llega la lista ya armada, asi el
 * registro no carga los datos de telefonia de cada pais.
 */

export type Pais = { codigo: string; nombre: string; indicativo: string }

const NOMBRES = new Intl.DisplayNames(["es"], { type: "region" })

function esPais(codigo: string): codigo is CountryCode {
  return (getCountries() as string[]).includes(codigo)
}

export function listaDePaises(): Pais[] {
  return getCountries()
    .map((codigo) => ({
      codigo,
      nombre: NOMBRES.of(codigo) ?? codigo,
      indicativo: `+${getCountryCallingCode(codigo)}`,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/** El pais con el que abre el selector, si el que llega es uno de la lista. */
export function paisConocido(codigo: string | null): string {
  return codigo && esPais(codigo) ? codigo : ""
}

/** El numero completo con indicativo (`+573001234567`), o `null` si no vale para ese pais. */
export function celularInternacional(pais: string, numero: string): string | null {
  if (!esPais(pais)) return null
  const telefono = parsePhoneNumberFromString(numero, pais)
  return telefono?.country === pais && telefono.isValid() ? telefono.number : null
}
