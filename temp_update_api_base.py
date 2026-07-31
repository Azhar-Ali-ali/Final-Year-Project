from pathlib import Path

root = Path(r'c:\files\Final-Year-Project')

files = []
for path in root.rglob('*'):
    if path.is_file() and path.suffix.lower() in {'.html', '.js'}:
        rel = path.relative_to(root)
        if 'back_end' in rel.parts or 'node_modules' in rel.parts or '.venv' in rel.parts:
            continue
        if 'AI-Clothing-AI' in rel.parts or 'Front_End' in rel.parts or path.name in {
            'cart.html','checkout.html','Customer_Dashboard.html','help_support.html','homepage.html','login_register.html',
            'my_addresses.html','my_messages.html','my_orders.html','my_profile.html','my_returns_refunds.html',
            'order_details.html','products_details.html','return_request_details.html','sellerprofile.html','track_refund.html','wishlist.html','all_product_spages.html'
        }:
            files.append(path)

replacements = [
    ("const API_BASE_URL = 'http://localhost:5000/api';", "const API_BASE_URL = `${window.location.origin}/api`;"),
    ("const API_BASE_URL = (location.protocol === 'file:' ? 'http://localhost:5000' : `${location.protocol}//${location.hostname}:5000`);", "const API_BASE_URL = `${window.location.origin}/api`;"),
    ("const API_BASE_URL = (location.protocol === 'file:' ? 'http://localhost:5000/api' : `${location.protocol}//${location.hostname}:5000/api`);", "const API_BASE_URL = `${window.location.origin}/api`;"),
    ("const API_BASE_URL = window.ADMIN_API_BASE_URL || 'http://localhost:5000';", "const API_BASE_URL = window.ADMIN_API_BASE_URL || window.location.origin;"),
    ("const ADMIN_API_BASE_URL = window.ADMIN_API_BASE_URL || 'http://localhost:5000';", "const ADMIN_API_BASE_URL = window.ADMIN_API_BASE_URL || window.location.origin;"),
    ("const API_BASE_URL = 'http://localhost:5000';", "const API_BASE_URL = window.location.origin;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/dashboard';", "const API_BASE = `${window.location.origin}/api/seller/dashboard`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/inventory';", "const API_BASE = `${window.location.origin}/api/seller/inventory`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/payments';", "const API_BASE = `${window.location.origin}/api/seller/payments`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/products';", "const API_BASE = `${window.location.origin}/api/seller/products`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/messages';", "const API_BASE = `${window.location.origin}/api/seller/messages`;"),
    ("const SOCKET_URL = 'http://localhost:5000';", "const SOCKET_URL = window.location.origin;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/returns';", "const API_BASE = `${window.location.origin}/api/seller/returns`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/performance';", "const API_BASE = `${window.location.origin}/api/seller/performance`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/settings';", "const API_BASE = `${window.location.origin}/api/seller/settings`;"),
    ("const API_BASE = 'http://localhost:5000/api/seller/disputes';", "const API_BASE = `${window.location.origin}/api/seller/disputes`;"),
    ("const API_BASE = 'http://localhost:5000/api/admin/support';", "const API_BASE = `${window.location.origin}/api/admin/support`;"),
    ("const API_BASE = 'http://localhost:5000/api/admin/users';", "const API_BASE = `${window.location.origin}/api/admin/users`;"),
    ("return 'http://localhost:5000/api/admin/reports';", "return `${window.location.origin}/api/admin/reports`;"),
]

for path in files:
    text = path.read_text(encoding='utf-8')
    original = text
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('${API_BASE_URL}/api/', '${API_BASE_URL}/')
    text = text.replace('${API_BASE}/api/', '${API_BASE}/')
    if text != original:
        path.write_text(text, encoding='utf-8')

print(f'Updated {len(files)} frontend files.')
