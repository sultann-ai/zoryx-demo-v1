import { useScrollToHash } from '../../../lib/useScrollToHash'
import { HeaderCard } from './HeaderCard'
import { FindCard, GalleryGrid, HowCard, ReviewsRow } from './InfoSections'
import { OrderCards } from './OrderCards'
import { PromoCarousel } from './PromoCarousel'
import { QuickActions } from './QuickActions'
import { CategoryIcons, DealsRow, NewRow, PopularRow } from './Rows'

/**
 * The Home tab on phones, laid out like the home of a food-delivery app: header card, quick actions, promo carousel, category
 * icons, snap rows, your order, then a compact Find us. Same data, translations and rules as the website's Home; every section
 * holds its size while loading (skeletons) and renders nothing when it has no data.
 */
export default function MobileHome() {
  // /#find from another page (More, a link) lands on the Find us card once this chunk is here.
  useScrollToHash()
  return (
    <div className="space-y-6 px-4 pb-6 pt-2">
      <HeaderCard />
      <QuickActions />
      <PromoCarousel />
      <CategoryIcons />
      <OrderCards />
      <PopularRow />
      <NewRow />
      <DealsRow />
      <ReviewsRow />
      <GalleryGrid />
      <FindCard />
      <HowCard />
    </div>
  )
}
