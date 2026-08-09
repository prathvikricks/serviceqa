import { Link } from 'react-router-dom'
import { PageHeader } from './ui/Page'
import { Card, CardBody } from './ui/Card'

export function NotFound() {
  return (
    <div className="space-y-4">
      <PageHeader title="Page not found" subtitle="That URL doesn’t exist." />
      <Card>
        <CardBody className="text-sm text-text-secondary">
          The page you’re looking for isn’t here.{' '}
          <Link to="/" className="font-medium text-accent hover:underline">
            Back to dashboard
          </Link>
          .
        </CardBody>
      </Card>
    </div>
  )
}
