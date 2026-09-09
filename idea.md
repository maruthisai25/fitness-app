# VigorEngine

### **An AI fitness coach that remembers everything, adapts to you, and helps you train and eat based on what you actually have available.**

---

## 1. 👤 Personal Profile

VigorEngine maintains a persistent profile containing:

- Age
- Height
- Weight
- Fitness level
- Goals
- Training experience
- Preferred workout duration
- Preferred workout style
- Available equipment
- Training location
- Exercise preferences
- Exercise dislikes
- Dietary preferences
- Dietary restrictions
- Calorie target
- Protein target
- Macro targets
- Other user-defined constraints

The user can change these at any time.

---

# 2. 🧠 Persistent Personal Memory

VigorEngine remembers the user's history rather than treating every interaction as a fresh conversation.

### Workout memory

- Every workout
- Every exercise
- Sets
- Reps
- Weight/resistance
- RPE/difficulty
- Completion
- Modifications
- Notes
- Personal records
- Exercise progression

### Preference memory

- Exercises the user likes
- Exercises the user dislikes
- Preferred workout length
- Preferred training styles
- Equipment preferences
- Foods they like/dislike

### Constraint memory

- Available equipment
- Exercises they cannot perform
- Environmental limitations
- Time limitations
- Other user-defined constraints

### Behavioral memory

VigorEngine can identify long-term patterns such as:

- Frequently skipped workouts
- Exercises consistently underperforming
- Frequently eaten foods
- Typical meal patterns
- Consistently missed nutrition targets

### Memory controls

The user can:

- View memories
- Edit memories
- Delete memories
- Tell VigorEngine to forget something

---

# 3. 🏋️ AI Workout Coach

The user can simply ask:

> **"What should I do today?"**

VigorEngine considers:

- Previous workouts
- Recent training volume
- Muscle groups trained recently
- Exercise progression
- Current goals
- Fitness level
- Available equipment
- Available time
- Exercise preferences
- Recovery information
- Previous difficulty
- Current limitations

Then creates the appropriate workout.

---

# 4. 🔄 Adaptive Workout Generation

Workouts aren't static.

VigorEngine continuously adjusts:

- Exercise selection
- Exercise order
- Sets
- Reps
- Resistance/weight
- Rest periods
- Workout duration
- Difficulty
- Training volume

based on what happened in previous sessions.

---

# 5. 📈 Progressive Overload

VigorEngine tracks performance for individual exercises and determines when to progress.

For example:

> Last session: 20 lb × 10 × 3  
> Target: 8–12 reps  
> Result: 12/12/12  
>
> **Next session: increase resistance.**

Or:

> Last session: 25 lb × 8/6/6  
>
> **Keep the same resistance and build toward 8/8/8.**

Progression is based on actual performance rather than arbitrary increases.

---

# 6. 🔀 Exercise Substitution

If an exercise isn't possible, VigorEngine finds an appropriate alternative.

User:

> "I can't do this exercise."

VigorEngine considers:

- Target muscle
- Movement pattern
- Difficulty
- Equipment
- User's previous performance

and recommends the closest suitable alternative.

---

# 7. 🎯 Goal-Based Training

Workouts adapt according to the user's goals.

Possible goals:

- Strength
- Muscle growth
- Fat loss
- General fitness
- Endurance
- Mobility
- Conditioning
- Consistency

Multiple goals can coexist with different priorities.

---

# 8. 🏃 Workout Session Mode

A dedicated mode for actually performing the workout.

For each exercise:

- Exercise instructions
- Sets
- Target reps
- Target resistance
- Previous performance
- Rest timer
- Completed reps
- Actual resistance
- RPE/difficulty
- Notes

The user progresses through the workout one exercise/set at a time.

---

# 9. 📊 Workout History

Users can review:

- Previous workouts
- Individual exercises
- Previous weights
- Previous reps
- Volume
- RPE
- Workout duration
- Exercise progression
- Personal records

---

# 10. 🏆 Progress Tracking

Track progress across multiple dimensions.

### Strength

- Weight/resistance progression
- Rep progression
- Volume progression
- Personal records

### Body

- Weight
- Waist
- Measurements
- Optional progress photos

### Consistency

- Workouts completed
- Weekly completion
- Streaks
- Missed sessions

### Overall trends

VigorEngine identifies meaningful changes rather than just displaying numbers.

---

# 11. 🧘 Recovery & Readiness

The user can optionally report:

- Sleep
- Energy
- Soreness
- Fatigue
- Stress
- General readiness

VigorEngine uses this information to modify the day's workout.

For example:

> "You're feeling unusually fatigued today. Instead of increasing resistance, we'll keep the load the same and reduce volume."

---

# 12. 🔻 Deload & Plateau Detection

VigorEngine detects patterns such as:

- Performance declining
- RPE consistently increasing
- Repeated failed targets
- Excessive training volume
- Exercise plateaus

It can recommend:

- Maintaining weight
- Reducing volume
- Changing an exercise
- Taking a lighter session
- Deloading

---

# 13. 🍎 Nutrition Tracker

Track:

- Calories
- Protein
- Carbohydrates
- Fat
- Fiber
- Meals
- Snacks
- Daily totals

The user can log food manually or naturally.

For example:

> "I had 200g chicken, two rotis and some cottage cheese."

VigorEngine turns that into a nutrition entry.

---

# 14. 🥘 Ingredient Inventory

Users maintain a list of what they currently have.

Example:

**Available**

- Chicken
- Rice
- Eggs
- Cottage cheese
- Spinach
- Tomatoes
- Yogurt

VigorEngine can use this inventory when suggesting meals.

---

# 15. 👨‍🍳 AI Recipe Generator

User:

> "What can I make with what I have?"

VigorEngine generates recipes based on:

- Available ingredients
- Calories remaining
- Protein remaining
- Macro targets
- Dietary preferences
- Cooking time
- User preferences

---

# 16. 🎯 Nutrition-Aware Recipes

Recipes aren't generated independently from the nutrition tracker.

For example:

> **Remaining today**
>
> 680 calories  
> 56g protein

VigorEngine can specifically find/generate a meal that fits those requirements.

---

# 17. 🍽️ Meal Planning

VigorEngine can create:

- Individual meals
- Daily meal plans
- Multi-day meal plans
- High-protein meal plans
- Calorie-controlled meal plans
- Ingredient-based meal plans

It can also prioritize ingredients that need to be used soon.

---

# 18. ⭐ Saved Meals & Recipes

Users can save frequently eaten meals.

For example:

**Chicken Rice Bowl**

- 650 kcal
- 60g protein

Then logging it becomes essentially one action.

VigorEngine also learns which recipes the user actually makes.

---

# 19. 🧮 Daily Nutrition State

At any point VigorEngine knows:

> **Today**

- Calories consumed
- Calories remaining
- Protein consumed
- Protein remaining
- Carbs consumed
- Fat consumed
- Fiber consumed
- Meals logged

This allows the AI coach to make recommendations based on the **current day**, not just general nutrition advice.

---

# 20. 🤖 AI Coach Chat

A persistent conversational coach.

Users can ask:

- "What should I train today?"
- "What did I do last time?"
- "Can I increase the weight?"
- "Why am I doing this exercise?"
- "What should I eat?"
- "What can I make with chicken and rice?"
- "How much protein do I still need?"
- "Why haven't I progressed?"
- "Can you make today's workout shorter?"
- "I'm too tired for my normal workout."
- "Replace this exercise."
- "What should I focus on this week?"

The coach has access to the user's relevant history and memory.

---

# 21. 💡 Explainable Recommendations

VigorEngine explains **why** it made a recommendation.

For example:

> **Why did you choose this workout?**
>
> You trained legs yesterday, your last upper-body session was three days ago, and your pushing volume has been lower than your pulling volume recently.

Or:

> **Why didn't you increase the weight?**
>
> You reached 10 reps on the first set but fell below the target range on the remaining sets, so I'm keeping the resistance unchanged.

---

# 22. 🔍 Long-Term Insights

VigorEngine periodically analyzes accumulated data.

Examples:

> "Your squat has improved steadily for six weeks."

> "Your pulling strength is progressing faster than your pushing strength."

> "You've been consistently below your protein target on weekends."

> "Your workout completion rate is highest when sessions are under 30 minutes."

These insights should emerge from the user's actual history.

---

# 23. 📅 Weekly Review

At the end of each week:

### Training

- Workouts completed
- Volume
- Progress
- PRs
- Missed sessions
- Muscle-group balance

### Nutrition

- Average calories
- Average protein
- Macro consistency
- Frequently missed targets

### Coach summary

> **This week**
>
> You completed 4/5 workouts.
>
> Your average protein intake was 145g.
>
> Your squat and row both progressed.
>
> Next week, VigorEngine recommends maintaining your current lower-body volume and progressing your upper-body pulling work.

---

# 24. 📱 Smart Notifications / Reminders

Optional reminders for:

- Planned workouts
- Missed workouts
- Meal logging
- Protein targets
- Weekly reviews
- Progress measurements

But they should be intelligent rather than spammy.

---

# 25. 🛡️ Safety Awareness

VigorEngine recognizes when normal coaching shouldn't continue.

For example:

- Reported pain
- Injury
- Dizziness
- Unusual symptoms
- Excessive fatigue

It can stop progression or recommend seeking professional medical advice rather than blindly generating another workout.

---

# 26. 🔐 Local-First Privacy

The product promise:

> **Your fitness history belongs to you.**

Your:

- Workout history
- Nutrition history
- Personal profile
- Memories
- Preferences
- Progress

remain local.

External APIs are used only for things such as AI reasoning or external data when necessary.

---

# 27. 📴 Offline Functionality

Even without an internet connection, the user can still:

- Log workouts
- Log food
- View history
- View progress
- Access saved recipes
- Access saved workouts
- Review memories
- Track progression

AI-powered functionality can resume when API access returns.

---

# 28. 🧩 Personalized Exercise Library

Every exercise can contain:

- Name
- Movement pattern
- Primary muscles
- Secondary muscles
- Equipment
- Difficulty
- Instructions
- Variations
- Progressions
- Regressions
- Substitutions

And VigorEngine builds a history around each exercise.

---

# 29. 📸 Optional Progress Photos

Users can optionally track:

- Front
- Side
- Back

with dates so they can compare changes over time.

This should remain completely private/local.

---

# 30. 🧠 "Ask VigorEngine"

A general-purpose interface across the entire system.

The user doesn't have to know which feature to use.

They can simply say:

> **"I have 30 minutes, I'm tired, I only have my resistance bands, and I haven't trained since Monday. What should I do?"**

VigorEngine figures out that this requires:

**memory + workout history + recovery + equipment + time + progression + goals**

and produces the appropriate recommendation.

---

# The final feature set in one view

### **TRAIN**
- AI workout generation
- Adaptive workouts
- Progressive overload
- Exercise substitutions
- Workout session mode
- RPE/difficulty tracking
- Recovery-based adjustment
- Plateau detection
- Deload recommendations
- Exercise history
- Personal records

### **NUTRITION**
- Food logging
- Calorie tracking
- Macro tracking
- Protein/fiber tracking
- Ingredient inventory
- AI recipes
- Nutrition-aware recipes
- Saved meals
- Meal planning
- Daily nutrition targets

### **MEMORY**
- Workout memory
- Food memory
- Preferences
- Constraints
- Goals
- Behavioral patterns
- Long-term performance
- Editable/deletable memories

### **COACH**
- Natural-language interaction
- Personalized recommendations
- Cross-domain reasoning
- Explainable recommendations
- Long-term insights
- Weekly reviews

### **PROGRESS**
- Strength progression
- Weight/measurement tracking
- Workout consistency
- Nutrition consistency
- Trends
- PRs
- Progress photos
- Weekly summaries

### **PERSONALIZATION**
- Goals
- Equipment
- Available time
- Fitness level
- Exercise preferences
- Food preferences
- Dietary constraints
- Training environment

### **PRIVACY**
- Local-first data
- Local persistent memory
- Offline tracking
- User-controlled memory
- Optional external AI/API calls

---

## The one-sentence version

**VigorEngine is a persistent AI fitness coach that remembers your workouts, nutrition, preferences, constraints, and progress, then uses that history to decide what you should train and eat next based on your current goals, performance, recovery, available equipment, available ingredients, and real-world circumstances.**