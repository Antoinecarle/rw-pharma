import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/database'

interface ProductComboboxProps {
  products: Pick<Product, 'id' | 'cip13' | 'name'>[]
  value: string
  onValueChange: (id: string) => void
  placeholder?: string
}

export default function ProductCombobox({
  products, value, onValueChange, placeholder = 'Selectionner un produit...',
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false)

  const selected = products.find((p) => p.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs text-muted-foreground">{selected.cip13}</span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher CIP13, nom..." />
          <CommandList>
            <CommandEmpty>Aucun produit trouve.</CommandEmpty>
            <CommandGroup>
              {products.slice(0, 100).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.cip13} ${p.name}`}
                  onSelect={() => {
                    onValueChange(p.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-xs text-muted-foreground mr-2 shrink-0">{p.cip13}</span>
                  <span className="truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
