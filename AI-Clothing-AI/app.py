from flask import Flask, request, jsonify
import requests
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# =========================
# STEP 1: LOAD ONLINE DATA
# =========================
print("Loading online products...")

url = "https://fakestoreapi.com/products"
products = requests.get(url).json()

titles = []
features = []

for p in products:
    titles.append(p["title"])
    features.append(p["title"] + " " + p["category"])

print("Products loaded:", len(titles))

# =========================
# STEP 2: TRAIN THE MODEL
# =========================
print("Training AI model...")

vectorizer = CountVectorizer(stop_words='english')

# 🔥 THIS IS TRAINING STEP
matrix = vectorizer.fit_transform(features)

# 🔥 THIS BUILDS KNOWLEDGE (SIMILARITY MATRIX)
similarity = cosine_similarity(matrix)

print("Model trained successfully!")

# =========================
# STEP 3: RECOMMEND FUNCTION
# =========================
def recommend(product_name):

    index = -1

    # find product
    for i, title in enumerate(titles):
        if product_name.lower() in title.lower():
            index = i
            break

    if index == -1:
        return []

    scores = list(enumerate(similarity[index]))

    sorted_scores = sorted(scores, key=lambda x: x[1], reverse=True)[1:6]

    results = []

    for i in sorted_scores:
        results.append(titles[i[0]])

    return results

# =========================
# STEP 4: TEST MODEL (MANUAL TEST)
# =========================
print("\nTESTING MODEL LOCALLY...")
test_result = recommend("shirt")

print("\nTest Input: shirt")
print("Recommendations:")
for r in test_result:
    print("-", r)

# =========================
# STEP 5: API (FOR WEBSITE)
# =========================
@app.route("/recommend", methods=["GET"])
def get_recommendation():

    product = request.args.get("product")

    if not product:
        return jsonify({"error": "No product provided"})

    results = recommend(product)

    return jsonify({
        "input": product,
        "recommendations": results
    })

# =========================
# STEP 6: RUN SERVER
# =========================
if __name__ == "__main__":
    app.run(debug=True)