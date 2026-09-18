import { BookingListCard, type BookingCardActions } from '@/features/bookings/BookingListCard';
import type { Booking } from '@/types';
import React, { useCallback } from 'react';

export function useBookingCards({ activeTab, router, setSelectedDriverPhone, setSelectedDriverName,
  setContactModalVisible, handleCancel, isCancelling }: BookingCardActions) {
  const renderBookingCard = useCallback((bookingId: string, booking: Booking) => (
    <BookingListCard key={bookingId} booking={booking} activeTab={activeTab} router={router}
      setSelectedDriverPhone={setSelectedDriverPhone} setSelectedDriverName={setSelectedDriverName}
      setContactModalVisible={setContactModalVisible} handleCancel={handleCancel} isCancelling={isCancelling} />
  ), [activeTab, router, setSelectedDriverPhone, setSelectedDriverName, setContactModalVisible, handleCancel, isCancelling]);
  const renderBookingListItem = useCallback(({ item }: { item: Booking }) =>
    renderBookingCard(item.id, item), [renderBookingCard]);
  return { renderBookingCard, renderBookingListItem };
}
