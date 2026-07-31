from pathlib import Path

root = Path(r'c:\files\Final-Year-Project')
files = [
    root / 'all_product_spages.html',
    root / 'AI-Clothing-AI' / 'all_product_spages.html',
    root / 'wishlist.html',
    root / 'Front_End' / 'Admin' / 'js' / 'notificationsUI.js',
    root / 'Front_End' / 'Admin' / 'pages' / 'admin_login.html',
    root / 'Front_End' / 'Admin' / 'js' / 'Reports-Analytics.js',
    root / 'Front_End' / 'Seller' / 'pages' / 'Dispute-Management.html',
    root / 'Front_End' / 'Seller' / 'js' / 'Order-management.js',
]

for path in files:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    original = text
    text = text.replace('${API_BASE_URL}/api/', '${API_BASE_URL}/')
    text = text.replace('${API_BASE}/api/', '${API_BASE}/')
    text = text.replace('${ADMIN_API_BASE_URL}/api/', '${ADMIN_API_BASE_URL}/')
    text = text.replace('${ADMIN_API_BASE_URL}/admin/auth/login', '${ADMIN_API_BASE_URL}/admin/auth/login')
    text = text.replace('${API_BASE_URL}/api/admin/dashboard/notifications', '${API_BASE_URL}/admin/dashboard/notifications')
    text = text.replace("${ADMIN_API_BASE_URL}/api/admin/auth/login", "${ADMIN_API_BASE_URL}/admin/auth/login")
    if text != original:
        path.write_text(text, encoding='utf-8')

print('Finished cleaning API URL prefixes.')
