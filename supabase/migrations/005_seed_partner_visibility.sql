-- Make seeded partner ticket visible to the seeded PARTNER user
UPDATE tickets
SET customer_name = 'Chidinma Okafor',
    customer_email = 'chidinma@example.com'
WHERE id = 'RET-20260717-001';
