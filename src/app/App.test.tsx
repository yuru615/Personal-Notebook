import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App shell', () => {
  it('renders the seeded page tree and current page header', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: '快速开始' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '快速开始' })).toBeInTheDocument()
  })
})
