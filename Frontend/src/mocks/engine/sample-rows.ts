import type { PreviewColumn } from '@/types'
import { iso, pick, prng } from '../util'

const COMPANIES = ['Shree Ganesh Traders', 'Patil Agencies', 'Kaveri Distributors', 'Om Sai Enterprises', 'Mehta Wholesale', 'Sunrise Retail Mart', 'Gupta & Sons', 'Annapurna Stores', 'Deccan Supply Co', 'Narmada Trading', 'Vijay Provisions', 'Lakshmi Agencies']
const PEOPLE = ['Aarav Kulkarni', 'Diya Sharma', 'Rohan Desai', 'Isha Patel', 'Kabir Joshi', 'Meera Pillai', 'Arjun Reddy', 'Sneha Iyer', 'Vikram Singh', 'Pooja Bansal']
const CITIES = ['Pune', 'Mumbai', 'Nashik', 'Surat', 'Indore', 'Nagpur', 'Aurangabad', 'Ahmedabad']
const STATES = ['Maharashtra', 'Gujarat', 'Madhya Pradesh', 'Karnataka']
const PRODUCTS = ['Basmati Rice 25kg', 'Sunflower Oil 15L', 'Toor Dal 30kg', 'Detergent Powder 1kg', 'Tea Premium 500g', 'Biscuits Family Pack', 'Sugar 50kg', 'Atta 10kg']
const CATEGORIES = ['Staples', 'Edible Oil', 'Pulses', 'Home Care', 'Beverages', 'Snacks']
const STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
const STATUSES = ['OPEN', 'PAID', 'PARTIAL', 'OVERDUE']
const MODES = ['NEFT', 'RTGS', 'UPI', 'CHEQUE', 'CASH']
const SEGMENTS = ['Key account', 'Mid-market', 'Retail', 'Institutional']

function valueFor(column: PreviewColumn, rand: () => number, row: number): unknown {
  const name = column.name.toLowerCase()
  const type = column.data_type.toLowerCase()
  if (type.includes('bool')) return rand() > 0.3
  if (name === 'id' || name.endsWith('_id') || name.endsWith('_sk') || name.endsWith('_key') || name.endsWith('_code')) {
    if (type.includes('int')) return name.endsWith('date_key') ? 20260000 + 1000 + Math.floor(rand() * 900) : 100000 + row * 7 + Math.floor(rand() * 5)
    const prefix = name.replace(/_(id|sk|key|code)$/, '').slice(0, 3).toUpperCase() || 'ID'
    return `${prefix}-${String(10000 + row * 13 + Math.floor(rand() * 9)).padStart(6, '0')}`
  }
  if (type.includes('timestamp')) return iso(Date.now() - Math.floor(rand() * 90 * 86_400_000))
  if (type === 'date' || name.endsWith('_date') || name.endsWith('_on') || name === 'date' || name === 'month' || name === 'valid_from') {
    return iso(Date.now() - Math.floor(rand() * 365 * 86_400_000)).slice(0, 10)
  }
  if (name.includes('email')) return `${pick(rand, PEOPLE).toLowerCase().replace(' ', '.')}@example.com`
  if (name.includes('phone')) return `+91 98${Math.floor(10000000 + rand() * 89999999)}`
  if (name.includes('gstin')) return rand() > 0.1 ? `27AAB${String.fromCharCode(65 + Math.floor(rand() * 26))}${Math.floor(1000 + rand() * 8999)}F1Z${Math.floor(rand() * 9)}` : null
  if (name.includes('city')) return pick(rand, CITIES)
  if (name.includes('state')) return pick(rand, STATES)
  if (name.includes('stage')) return pick(rand, STAGES)
  if (name.includes('segment')) return pick(rand, SEGMENTS)
  if (name.includes('category') || name === 'family') return pick(rand, CATEGORIES)
  if (name.includes('mode')) return pick(rand, MODES)
  if (name === 'status') return pick(rand, STATUSES)
  if (name === 'uom') return pick(rand, ['BAG', 'BOX', 'LTR', 'KG', 'PCS'])
  if (name.includes('bucket')) return pick(rand, ['0-30', '31-60', '61-90', '90+'])
  if (name.includes('product') || name.includes('item_name')) return pick(rand, PRODUCTS)
  if (name.includes('customer_name') || name.includes('account_name') || name === 'name' || name.includes('distributor')) return pick(rand, COMPANIES)
  if (name.includes('full_name') || name.includes('first_name') || name.includes('last_name')) return pick(rand, PEOPLE)
  if (name.includes('probability') || name.includes('rate')) return Math.round(rand() * 100) / (name.includes('gst') ? 1 : 100)
  if (type.includes('numeric') || type.includes('decimal')) {
    const scale = name.includes('limit') ? 2_000_000 : name.includes('amount') || name.includes('revenue') || name.includes('value') || name.includes('price') || name.includes('collected') ? 250_000 : 500
    return Math.round(rand() * scale * 100) / 100
  }
  if (type.includes('int')) return Math.floor(rand() * 400)
  return `${column.name.replace(/_/g, ' ')} ${row + 1}`
}

/** Deterministic, realistic-looking sample rows for previews. Labelled as simulated in the UI. */
export function generateRows(columns: PreviewColumn[], count: number, seed: string, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const row = offset + i
    const rand = prng(`${seed}:${row}`)
    return Object.fromEntries(columns.map((c) => [c.name, valueFor(c, rand, row)]))
  })
}
