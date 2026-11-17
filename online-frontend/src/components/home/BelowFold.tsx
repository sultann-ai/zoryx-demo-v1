import { useScrollToHash } from '../../lib/useScrollToHash'
import { CategoriesSection } from './CategoriesSection'
import { DealsSection } from './DealsSection'
import { NewSection, PopularSection } from './ItemRows'
import { OfferSection } from './OfferSection'
import { FindSection, GallerySection, HowSection, ReviewsSection, WhySection } from './Sections'

/**
 * The band rhythm under the green hero: cream and white alternate up to the green "Why" band, then white and cream
 * alternate down to the ink footer, always ending on cream. Colours go by what is rendered (empty sections render
 * nothing), so two neighbours never match: see .home-bands-start / .home-bands-end in index.css.
 */
export default function BelowFold() {
  // /#find from another page lands here once this chunk has loaded.
  useScrollToHash()
  return (
    <>
      <div className="home-sections home-bands-start">
        <CategoriesSection />
        <NewSection />
        <PopularSection />
        <OfferSection />
        <DealsSection />
      </div>
      <div className="home-sections home-bands-end">
        <WhySection />
        <HowSection />
        <ReviewsSection />
        <GallerySection />
        <FindSection />
      </div>
    </>
  )
}
