import Head from "next/head"
import { useRouter } from "next/router"
import React, { ReactNode } from "react"

const links = [{ rel: 'icon', href: process.env.NEXT_PUBLIC_BASE_PATH + '/static/favicon.svg', type: 'image/svg+xml' }]

export type PageHeadProps = {
  title: string
  description: string
  children?: ReactNode
}

export function PageHead(props: PageHeadProps) {
  const { title, description, children } = props

  const router = useRouter()

  return (
    <Head>
      <meta key="charset" charSet="UTF-8" />
      <meta
        key="viewport"
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      />
      <title key="title">
        {title === "LDS Studio" ? title : `${title} • LDS Studio`}
      </title>
      <meta key="description" name="description" content={description} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:image" property="og:image" content={process.env.NEXT_PUBLIC_BASE_PATH + "/static/favicon.svg"} />
      <meta
        key="og:url"
        property="og:url"
        content={`https://lolekx228.github.io/Lolekx-s-Development-Studio-Bot${router.pathname}`}
      />
      <meta
        key="og:description"
        property="og:description"
        content={description}
      />
      <meta key="og:site_name" property="og:site_name" content="LDS Studio" />
      <link
        key="canonical"
        rel="canonical"
        href={`https://lolekx228.github.io/Lolekx-s-Development-Studio-Bot${router.pathname}`}
      />
      {links.map(link => (
        <link key={`${link.rel}:${link.href}`} {...link} />
      ))}
      <meta
        key="application-name"
        name="application-name"
        content="LDS Studio"
      />
      <meta key="theme-color" name="theme-color" content="#58b9ff" />
      <meta key="color-scheme" name="color-scheme" content="dark light" />
      <meta key="google" name="google" content="notranslate" />
      {children}
    </Head>
  )
}
