/** Units in groups. Each unit's factor converts it to the group's base unit. */

export interface Unit {
  id: string;
  label: string;
  /** Multiply by this to get the base unit (temperature uses toBase/fromBase). */
  factor?: number;
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
  note?: string;
}

export interface UnitGroup {
  id: string;
  label: string;
  units: Unit[];
}

export const UNIT_GROUPS: UnitGroup[] = [
  {
    id: 'length',
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimetre (mm)', factor: 0.001 },
      { id: 'cm', label: 'Centimetre (cm)', factor: 0.01 },
      { id: 'm', label: 'Metre (m)', factor: 1 },
      { id: 'km', label: 'Kilometre (km)', factor: 1000 },
      { id: 'in', label: 'Inch (in)', factor: 0.0254 },
      { id: 'ft', label: 'Foot (ft)', factor: 0.3048 },
      { id: 'yd', label: 'Yard (yd) / gaj', factor: 0.9144 },
      { id: 'mi', label: 'Mile (mi)', factor: 1609.344 },
      { id: 'nmi', label: 'Nautical mile', factor: 1852 },
    ],
  },
  {
    id: 'weight',
    label: 'Weight',
    units: [
      { id: 'mg', label: 'Milligram (mg)', factor: 1e-6 },
      { id: 'g', label: 'Gram (g)', factor: 0.001 },
      { id: 'kg', label: 'Kilogram (kg)', factor: 1 },
      { id: 'quintal', label: 'Quintal', factor: 100 },
      { id: 't', label: 'Tonne (t)', factor: 1000 },
      { id: 'oz', label: 'Ounce (oz)', factor: 0.028349523125 },
      { id: 'lb', label: 'Pound (lb)', factor: 0.45359237 },
      { id: 'tola', label: 'Tola', factor: 0.0116638038, note: 'Standard tola, 11.664 g' },
      { id: 'ct', label: 'Carat (ct)', factor: 0.0002 },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    units: [
      { id: 'sqft', label: 'Square foot', factor: 0.09290304 },
      { id: 'sqyd', label: 'Square yard / gaj', factor: 0.83612736 },
      { id: 'sqm', label: 'Square metre', factor: 1 },
      { id: 'guntha', label: 'Guntha', factor: 101.17141056, note: '1 guntha = 121 square yards' },
      { id: 'bigha', label: 'Bigha', factor: 1600 * 0.83612736, note: 'Varies by state; 1,600 square yards used here' },
      { id: 'acre', label: 'Acre', factor: 4046.8564224 },
      { id: 'ha', label: 'Hectare', factor: 10000 },
      { id: 'sqkm', label: 'Square kilometre', factor: 1e6 },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    units: [
      { id: 'ml', label: 'Millilitre (ml)', factor: 0.001 },
      { id: 'l', label: 'Litre (l)', factor: 1 },
      { id: 'm3', label: 'Cubic metre', factor: 1000 },
      { id: 'tsp', label: 'Teaspoon', factor: 0.005 },
      { id: 'tbsp', label: 'Tablespoon', factor: 0.015 },
      { id: 'cup', label: 'Cup', factor: 0.24 },
      { id: 'galus', label: 'US gallon', factor: 3.785411784 },
      { id: 'galuk', label: 'UK gallon', factor: 4.54609 },
      { id: 'cft', label: 'Cubic foot', factor: 28.316846592 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    units: [
      { id: 'c', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'f', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: 'k', label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    units: [
      { id: 'kmh', label: 'km per hour', factor: 1 / 3.6 },
      { id: 'ms', label: 'metre per second', factor: 1 },
      { id: 'mph', label: 'miles per hour', factor: 0.44704 },
      { id: 'kn', label: 'knot', factor: 0.514444 },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    units: [
      { id: 'b', label: 'Byte', factor: 1 },
      { id: 'kb', label: 'Kilobyte (KB, 1024)', factor: 1024 },
      { id: 'mb', label: 'Megabyte (MB)', factor: 1024 ** 2 },
      { id: 'gb', label: 'Gigabyte (GB)', factor: 1024 ** 3 },
      { id: 'tb', label: 'Terabyte (TB)', factor: 1024 ** 4 },
    ],
  },
];

export function convert(value: number, from: Unit, to: Unit): number {
  const base = from.toBase ? from.toBase(value) : value * (from.factor ?? 1);
  return to.fromBase ? to.fromBase(base) : base / (to.factor ?? 1);
}

/** A readable number: up to 6 significant decimals, no trailing zeros, Indian digit grouping off. */
export function tidy(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(n.toPrecision(10)));
}
