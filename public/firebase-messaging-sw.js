// Shows push notifications sent by the Feldele server (functions/index.js)
// when the app is closed or in the background, and opens the app on tap.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { notification: { title: 'Feldele', body: event.data ? event.data.text() : '' } }
  }
  const n = payload.notification || {}
  const data = payload.data || {}
  const title = n.title || data.title || 'Feldele'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body || data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { link: (payload.fcmOptions && payload.fcmOptions.link) || data.link || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate(link)
          return w.focus()
        }
      }
      return self.clients.openWindow(link)
    }),
  )
})
