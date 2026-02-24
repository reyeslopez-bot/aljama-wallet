// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TikTokFramerFeed from '@/components/home/TikTokFramerFeed.client'

describe('TikTokFramerFeed', () => {
  it('renders clip cards, text, and style markers for the feed panel', () => {
    const { container, getByRole, getByText, getByTestId, getByLabelText } = render(
      <TikTokFramerFeed />,
    )

    const section = getByTestId('home-tiktok-feed-section')
    const title = getByRole('heading', { level: 2, name: 'Short Clips Feed' })
    const eyebrow = getByText('Social Pulse')

    expect(section).toBeTruthy()
    expect(title.className).toContain('text-ivory')
    expect(eyebrow.className).toContain('text-saffron/80')

    expect(getByText('GagaMoves')).toBeTruthy()
    expect(getByText('UrbanFlow')).toBeTruthy()
    expect(getByText('SpinMaster')).toBeTruthy()

    expect(getByLabelText('GagaMoves profile')).toBeTruthy()
    expect(getByLabelText('UrbanFlow profile')).toBeTruthy()
    expect(getByLabelText('SpinMaster profile')).toBeTruthy()

    const videos = container.querySelectorAll('video')
    expect(videos.length).toBe(3)
    videos.forEach((video) => {
      expect(video.autoplay).toBe(true)
      expect(video.loop).toBe(true)
      expect(video.muted).toBe(true)
      expect(video.playsInline).toBe(true)
    })
  })
})
