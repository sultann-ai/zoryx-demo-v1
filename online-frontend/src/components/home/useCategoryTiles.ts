import { useMenu } from '../../api/menu'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'

export interface CategoryTileData {
  id: string
  name: string
  count: number
  src: string | null
  hasTransparency: boolean | undefined
}

/** The categories that have orderable items: the category's own photo, else its first item's photo. */
export function useCategoryTiles(): { tiles: CategoryTileData[]; isPending: boolean } {
  const { lang } = useT()
  const { data, isPending } = useMenu()
  const tiles = (data?.categories ?? [])
    .map((category) => {
      const items = data!.items.filter((item) => item.categoryId === category.id && (item.orderable || item.isOpenPrice))
      const firstWithPhoto = items.find((item) => item.image?.thumb || item.imageUrl)
      const photo = category.image ?? firstWithPhoto?.image ?? null
      return {
        id: category.id,
        name: pick(lang, category.name, category.nameUr) ?? category.name,
        count: items.length,
        src: photo?.thumb ?? (category.image ? null : firstWithPhoto?.imageUrl) ?? null,
        hasTransparency: photo?.hasTransparency,
      }
    })
    .filter((tile) => tile.count > 0)
  return { tiles, isPending }
}
