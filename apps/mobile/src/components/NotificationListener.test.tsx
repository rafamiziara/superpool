import type { NotificationData } from '@superpool/types'
import React from 'react'
import Toast from 'react-native-toast-message'
import { mockAddNotificationReceivedListener, mockAddNotificationResponseReceivedListener, mockRouterPush } from '../__tests__/setup'
import { render } from '../__tests__/test-utils'
import { NotificationListener } from './NotificationListener'

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn(), hide: jest.fn() },
}))

const mockToastShow = Toast.show as jest.Mock

function buildNotification(data: Partial<NotificationData>, title = 'New join request', body = 'Someone asked to join Builders Guild.') {
  return { request: { content: { title, body, data } } }
}

/** The handler the component registered for notifications arriving in-app. */
function receivedHandler() {
  return mockAddNotificationReceivedListener.mock.calls[0][0]
}

/** The handler the component registered for taps. */
function tappedHandler() {
  return mockAddNotificationResponseReceivedListener.mock.calls[0][0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAddNotificationReceivedListener.mockReturnValue({ remove: jest.fn() })
  mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() })
})

describe('NotificationListener', () => {
  it('renders nothing', () => {
    expect(render(<NotificationListener />).toJSON()).toBeNull()
  })

  it('removes both subscriptions on unmount', () => {
    const removeReceived = jest.fn()
    const removeTapped = jest.fn()
    mockAddNotificationReceivedListener.mockReturnValue({ remove: removeReceived })
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: removeTapped })

    render(<NotificationListener />).unmount()

    expect(removeReceived).toHaveBeenCalled()
    expect(removeTapped).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Arriving while the app is open.
  //
  // A system banner over the app the user is already looking at is the wrong
  // treatment; an in-app toast is the right one.
  // -------------------------------------------------------------------------

  describe('arriving', () => {
    it('shows a toast carrying the notification’s own words', () => {
      render(<NotificationListener />)

      receivedHandler()(buildNotification({ kind: 'membership_requested', poolId: '7', poolName: 'Builders Guild', actor: '0xabc' }))

      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'New join request', text2: 'Someone asked to join Builders Guild.' })
      )
    })

    // Being told a request exists and then having to go and find it is most of
    // the problem this feature exists to solve.
    it('makes the toast open the queue it is about', () => {
      render(<NotificationListener />)

      receivedHandler()(buildNotification({ kind: 'loan_requested', poolId: '7', poolName: 'Builders Guild', actor: '0xabc' }))

      const { onPress } = mockToastShow.mock.calls[0][0]
      onPress()

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/approvals?poolId=7')
    })

    it('ignores a notification with no kind it recognises', () => {
      render(<NotificationListener />)

      receivedHandler()(buildNotification({ poolId: '7' }))
      receivedHandler()(buildNotification({ kind: 'something_else' as NotificationData['kind'], poolId: '7' }))

      expect(mockToastShow).not.toHaveBeenCalled()
    })

    it('ignores a notification with no pool to open', () => {
      render(<NotificationListener />)

      receivedHandler()(buildNotification({ kind: 'loan_requested' }))

      expect(mockToastShow).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Tapped.
  //
  // Expo replays the tap that launched the app through this same listener, so
  // a cold start needs no separate path.
  // -------------------------------------------------------------------------

  describe('tapped', () => {
    it('opens the loan queue for a borrow request', () => {
      render(<NotificationListener />)

      tappedHandler()({
        notification: buildNotification({ kind: 'loan_requested', poolId: '12', poolName: 'Builders Guild', actor: '0xabc' }),
      })

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/approvals?poolId=12')
    })

    it('opens the member register for a join request', () => {
      render(<NotificationListener />)

      tappedHandler()({
        notification: buildNotification({ kind: 'membership_requested', poolId: '12', poolName: 'Builders Guild', actor: '0xabc' }),
      })

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/members?poolId=12')
    })

    it('goes nowhere for a payload it cannot read', () => {
      render(<NotificationListener />)

      tappedHandler()({ notification: buildNotification({}) })

      expect(mockRouterPush).not.toHaveBeenCalled()
    })
  })
})
