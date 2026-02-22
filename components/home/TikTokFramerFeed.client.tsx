'use client'

import type { ReactNode } from 'react'

type ReelPost = {
  id: string
  videoSrc: string
  profileImageSrc: string
  trackImageSrc: string
  creator: string
  caption: string
  hashtags: string
  likes: string
  comments: string
  saves: string
  shares: string
}

const POSTS: ReelPost[] = [
  {
    id: 'gagamoves',
    videoSrc: 'https://framerusercontent.com/assets/dtM4MD4UlmanZB27MGTjmtceXkI.mp4',
    profileImageSrc: 'https://framerusercontent.com/images/w2hyXovpoCcfHZkjR4Hmr53RA5o.jpg?width=3456&height=5184',
    trackImageSrc: 'https://framerusercontent.com/images/vl8BQUJX1ipLEUxTN3W4NzmI.jpg?width=2160&height=2700',
    creator: 'GagaMoves',
    caption: 'That moment when the beat drops and your body just follows.',
    hashtags: '#dancechallenge #smoothmoves #transitiondance #foryou #viral',
    likes: '12.9K',
    comments: '310',
    saves: '1,204',
    shares: '560',
  },
  {
    id: 'urbanflow',
    videoSrc: 'https://framerusercontent.com/assets/Gwp6hUFVTf5R5XumVhF9WTG9aFU.mp4',
    profileImageSrc: 'https://framerusercontent.com/images/UuDV301wreukIOoiG9FJlXjv0gg.jpg?width=2965&height=4448',
    trackImageSrc: 'https://framerusercontent.com/images/ywrGM0NFWtN2Mc6afbEAc8CE1NQ.jpg?width=3343&height=4176',
    creator: 'UrbanFlow',
    caption: 'Freestyling under the sun today. This one felt good.',
    hashtags: '#streetdance #freestyle #dancevibes #urbanstyle #fyp',
    likes: '32.5K',
    comments: '1,108',
    saves: '2,543',
    shares: '820',
  },
  {
    id: 'spinmaster',
    videoSrc: 'https://framerusercontent.com/assets/GDwN0h5n8ocg8lCXuOmXEGW9pmM.mp4',
    profileImageSrc: 'https://framerusercontent.com/images/Arw2NYn91G3Erj9gd1uGwtRmys.jpg?width=2983&height=4474',
    trackImageSrc: 'https://framerusercontent.com/images/zdEnsk9HJtH0xMbK7FHO0x2emo.jpg?width=2526&height=2390',
    creator: 'SpinMaster',
    caption: 'Practiced this spin all week and finally nailed the slow-motion cut.',
    hashtags: '#slowmo #danceedit #spindance #creativecut #trending',
    likes: '19.4K',
    comments: '689',
    saves: '1,498',
    shares: '470',
  },
]

type ActionStatProps = {
  value: string
  label: string
  icon: ReactNode
}

function ActionStat({ value, label, icon }: ActionStatProps) {
  return (
    <div className="flex cursor-pointer flex-col items-center gap-1">
      {icon}
      <span
        className="text-xs font-semibold leading-none tracking-tight text-white"
        style={{ fontFamily: 'Inter, "Inter Placeholder", sans-serif' }}
      >
        {value}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}

function ProfileBadge({ imageSrc, creator }: { imageSrc: string; creator: string }) {
  return (
    <div className="relative">
      <div
        className="h-[38px] w-[38px] rounded-full border-2 border-white bg-cover bg-center"
        style={{ backgroundImage: `url(${imageSrc})` }}
        role="img"
        aria-label={`${creator} profile`}
      />
      <div className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55] text-sm font-bold text-white">
        +
      </div>
    </div>
  )
}

function TrackBadge({ imageSrc, creator }: { imageSrc: string; creator: string }) {
  return (
    <div
      className="h-[30px] w-[30px] rounded-full bg-cover bg-center"
      style={{ backgroundImage: `url(${imageSrc})` }}
      role="img"
      aria-label={`${creator} track`}
    />
  )
}

function HeartIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M20 2H4c-1.1 0-2 .9-2 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M21 12l-7-7v4C7 10 4 15 3 20c2.5-3.5 6-5.1 11-5.1V19l7-7z" />
    </svg>
  )
}

function MutedIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

export default function TikTokFramerFeed() {
  return (
    <section data-testid="home-tiktok-feed-section" className="scroll-mt-28">
      <div className="surface-panel panel-glow-rose relative overflow-hidden p-7 sm:p-8">
        <div className="absolute inset-x-8 top-5 ornament-line" />

        <div className="relative space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">Social Pulse</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">Short Clips Feed</h2>
            <p className="mt-2 text-sm text-ivory/70">
              Framer-style vertical reel panel placed above share, with snap scrolling.
            </p>
          </div>

          <div className="framer-15tqrnr" data-framer-name="Main">
            <div className="framer-3mqtgn-container" data-code-component-plugin-id="84d4c1">
              <div
                className="tiktok-feed relative mx-auto h-[680px] w-full max-w-[340px] overflow-y-auto rounded-[20px] bg-black sm:h-[760px] sm:max-w-[360px]"
                style={{
                  scrollSnapType: 'y mandatory',
                  scrollbarWidth: 'none',
                }}
              >
                {POSTS.map((post) => (
                  <div
                    key={post.id}
                    className="relative h-full min-h-full w-full snap-start overflow-hidden"
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <video
                      src={post.videoSrc}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />

                    <div className="absolute bottom-3 right-3 z-10 flex flex-col items-center gap-5">
                      <ProfileBadge imageSrc={post.profileImageSrc} creator={post.creator} />
                      <ActionStat value={post.likes} label="likes" icon={<HeartIcon />} />
                      <ActionStat value={post.comments} label="comments" icon={<CommentIcon />} />
                      <ActionStat value={post.saves} label="saves" icon={<SaveIcon />} />
                      <ActionStat value={post.shares} label="shares" icon={<ShareIcon />} />
                      <TrackBadge imageSrc={post.trackImageSrc} creator={post.creator} />
                    </div>

                    <div className="absolute bottom-3 left-3 right-[82px] z-10 flex flex-col justify-end">
                      <div className="mb-2">
                        <span
                          className="text-base font-bold text-white"
                          style={{ fontFamily: 'Inter, "Inter Placeholder", sans-serif' }}
                        >
                          {post.creator}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p
                          className="text-sm leading-snug text-white/85"
                          style={{ fontFamily: 'Inter, "Inter Placeholder", sans-serif' }}
                        >
                          {post.caption}
                        </p>
                        <p
                          className="text-sm leading-snug text-white/80"
                          style={{ fontFamily: 'Inter, "Inter Placeholder", sans-serif' }}
                        >
                          {post.hashtags}
                        </p>
                      </div>
                    </div>

                    <div className="absolute right-3 top-3 z-10 flex h-[22px] w-[22px] items-center justify-center">
                      <MutedIcon />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
