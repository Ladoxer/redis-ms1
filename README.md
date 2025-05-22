# Redis Message Queue System with NestJS

A sophisticated message queue system built with NestJS and Redis, featuring priority-based message processing, duplicate detection, and comprehensive message lifecycle management.

## 🚀 Features

- **Priority-based Message Queues**: Support for URGENT, HIGH, NORMAL, and LOW priority messages
- **Duplicate Detection**: Prevents duplicate messages using Redis Sets
- **Message Lifecycle Management**: Track messages through PENDING → PROCESSING → COMPLETED/FAILED states
- **Retry Mechanism**: Automatic retry support for failed messages (up to 3 attempts)
- **Queue Statistics**: Real-time statistics and monitoring
- **Type-Safe**: Full TypeScript support with proper type guards
- **RESTful API**: Clean REST endpoints for all operations

## 📋 Prerequisites

- Node.js (v16 or higher)
- Redis Server (v6 or higher)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd redis-message-queue
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start Redis server**
   
   **macOS (using Homebrew):**
   ```bash
   brew install redis
   brew services start redis
   ```
   
   **Ubuntu/Debian:**
   ```bash
   sudo apt update
   sudo apt install redis-server
   sudo systemctl start redis-server
   ```
   
   **Windows (using Docker):**
   ```bash
   docker run --name redis -p 6379:6379 -d redis
   ```

4. **Verify Redis installation**
   ```bash
   redis-cli ping
   # Should respond with: PONG
   ```

5. **Start the application**
   ```bash
   npm run start:dev
   ```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/messages
```

### 📝 Create Message
Create a new message with optional priority.

**POST** `/messages`

```bash
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Process this important task",
    "priority": "high"
  }'
```

**Request Body:**
```typescript
{
  content: string;      // Message content (required)
  priority?: string;    // "urgent" | "high" | "normal" | "low" (default: "normal")
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message added to queue",
  "data": {
    "id": "msg_1234567890_abc123",
    "content": "Process this important task",
    "priority": "high",
    "status": "pending",
    "timestamp": "2025-05-22T10:30:00.000Z",
    "retryCount": 0
  }
}
```

### 📊 Get All Messages
Retrieve all messages from all priority queues.

**GET** `/messages`

```bash
curl http://localhost:3000/messages
```

### 🎯 Get Messages by Priority
Get messages from a specific priority queue.

**GET** `/messages/priority/{priority}`

```bash
curl http://localhost:3000/messages/priority/urgent
```

### ⚡ Process Next Message
Get the next highest-priority message for processing.

**GET** `/messages/next`

```bash
curl http://localhost:3000/messages/next
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg_1234567890_abc123",
      "content": "Process this important task",
      "priority": "high",
      "status": "processing",
      "timestamp": "2025-05-22T10:30:00.000Z",
      "processingStartTime": "2025-05-22T10:35:00.000Z",
      "retryCount": 0
    },
    "queueStats": {
      "totalMessages": 15,
      "pendingMessages": 8,
      "processingMessages": 2,
      "completedMessages": 4,
      "failedMessages": 1,
      "priorityBreakdown": {
        "urgent": 2,
        "high": 3,
        "normal": 2,
        "low": 1
      },
      "uniqueMessageIds": 15
    }
  }
}
```

### ✅ Complete Message
Mark a message as completed or failed.

**PUT** `/messages/{messageId}/complete?success={true|false}`

```bash
# Mark as completed
curl -X PUT "http://localhost:3000/messages/msg_1234567890_abc123/complete?success=true"

# Mark as failed
curl -X PUT "http://localhost:3000/messages/msg_1234567890_abc123/complete?success=false"
```

### 🔄 Retry Failed Message
Retry a failed message (if retry count < 3).

**PUT** `/messages/{messageId}/retry`

```bash
curl -X PUT http://localhost:3000/messages/msg_1234567890_abc123/retry
```

### 📈 Get Queue Statistics
Get comprehensive queue statistics.

**GET** `/messages/stats`

```bash
curl http://localhost:3000/messages/stats
```

### 🧹 Clear Completed Messages
Remove all completed messages from the system.

**DELETE** `/messages/completed`

```bash
curl -X DELETE http://localhost:3000/messages/completed
```

### 💥 Purge All Queues
Clear all messages and reset the system (use with caution).

**DELETE** `/messages/all`

```bash
curl -X DELETE http://localhost:3000/messages/all
```

## 🏗️ Architecture

### Redis Data Structures Used

1. **Lists** (`queue:*`): Store messages for each priority level
   - `queue:urgent` - Urgent priority messages
   - `queue:high` - High priority messages
   - `queue:normal` - Normal priority messages
   - `queue:low` - Low priority messages

2. **Sets** (`*_messages`, `unique_message_ids`): Track message states and prevent duplicates
   - `unique_message_ids` - All message IDs ever created
   - `processing_messages` - Currently processing messages
   - `completed_messages` - Successfully completed messages
   - `failed_messages` - Failed messages
   - `content_hashes:{priority}` - Content hashes for duplicate detection

### Message Processing Flow

```
1. Message Created → PENDING (added to priority queue)
2. Message Retrieved → PROCESSING (moved to processing set)
3. Message Completed → COMPLETED/FAILED (moved to completion set)
4. Failed Message → Can be retried (moved back to queue)
```

### Priority Processing Order

Messages are processed in the following priority order:
1. URGENT
2. HIGH  
3. NORMAL
4. LOW

## 🔧 Redis Commands Reference

Explore the Redis data directly using Redis CLI:

```bash
redis-cli

# Check different priority queues
LRANGE queue:urgent 0 -1
LRANGE queue:high 0 -1
LRANGE queue:normal 0 -1
LRANGE queue:low 0 -1

# Check message tracking sets
SMEMBERS unique_message_ids
SMEMBERS processing_messages
SMEMBERS completed_messages
SMEMBERS failed_messages

# Get queue lengths
LLEN queue:urgent
LLEN queue:high
LLEN queue:normal
LLEN queue:low

# Get set sizes
SCARD unique_message_ids
SCARD processing_messages
```

## 📊 Message Data Structure

```typescript
interface MessageData {
  id: string;                    // Unique message identifier
  content: string;               // Message content
  timestamp: string;             // Creation timestamp (ISO string)
  priority: MessagePriority;     // Message priority level
  status: MessageStatus;         // Current message status
  retryCount?: number;           // Number of retry attempts
  processingStartTime?: string;  // When processing started
  completedTime?: string;        // When processing completed
  error?: string;                // Error message if failed
}
```

## 🚨 Error Handling

The system includes comprehensive error handling:

- **Duplicate Detection**: Prevents adding duplicate message content
- **Type Safety**: Runtime validation of message data
- **Graceful Failures**: Malformed JSON is handled safely
- **Retry Logic**: Failed messages can be automatically retried
- **Proper HTTP Status Codes**: RESTful error responses

## 🧪 Testing Examples

### Basic Workflow Test

```bash
# 1. Create messages with different priorities
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"Urgent task", "priority":"urgent"}'

curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"Normal task", "priority":"normal"}'

# 2. Check statistics
curl http://localhost:3000/messages/stats

# 3. Process next message (should get urgent first)
curl http://localhost:3000/messages/next

# 4. Complete the message (extract message ID from step 3)
curl -X PUT "http://localhost:3000/messages/{MESSAGE_ID}/complete?success=true"

# 5. Check updated statistics
curl http://localhost:3000/messages/stats
```

## 🛡️ Security Considerations

- Input validation on all endpoints
- Type-safe JSON parsing with validation
- Proper error handling without information leakage
- Redis connection error handling

## 🚀 Performance Features

- **In-Memory Operations**: Redis provides sub-millisecond response times
- **Atomic Operations**: All Redis operations are atomic
- **Efficient Data Structures**: Uses optimal Redis data types for each use case
- **Connection Pooling**: Single Redis connection per application instance

## 📝 Environment Configuration

Create a `.env` file for custom configuration:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password_if_needed
APP_PORT=3000
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙋‍♂️ Support

For questions and support, please open an issue in the repository.

---

**Built with ❤️ using NestJS and Redis** - Ladoxer